package opendedefender

import (
	"crypto/aes"
	"crypto/cipher"
	cryptorand "crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Bragoo312/defender-eye/internal/model"
	"github.com/Bragoo312/defender-eye/internal/normalizer"
	"github.com/gorilla/websocket"
)

type testSink struct {
	mu     sync.Mutex
	events []model.SecurityEvent
}

func (s *testSink) HandleEvent(event model.SecurityEvent) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.events = append(s.events, event)
}

func (s *testSink) count() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.events)
}

// clientEncrypt simulates Open Defender's cryptography.EncryptMessage
func clientEncrypt(pubKey *rsa.PublicKey, message []byte) ([]byte, error) {
	aesKey := make([]byte, 32)
	if _, err := io.ReadFull(cryptorand.Reader, aesKey); err != nil {
		return nil, err
	}

	block, err := aes.NewCipher(aesKey)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonce := make([]byte, 12)
	if _, err := io.ReadFull(cryptorand.Reader, nonce); err != nil {
		return nil, err
	}

	ciphertext := gcm.Seal(nil, nonce, message, nil)

	encryptedAESKey, err := rsa.EncryptOAEP(sha256.New(), cryptorand.Reader, pubKey, aesKey, nil)
	if err != nil {
		return nil, err
	}

	var result []byte
	result = append(result, encryptedAESKey...)
	result = append(result, nonce...)
	result = append(result, ciphertext...)
	return result, nil
}

// clientDecrypt simulates Open Defender's cryptography.DecryptMessage
func clientDecrypt(privKey *rsa.PrivateKey, data []byte) ([]byte, error) {
	keySize := privKey.Size()
	if len(data) < keySize+12+16 {
		return nil, fmt.Errorf("message too short: %d", len(data))
	}

	encryptedKey := data[:keySize]
	nonce := data[keySize : keySize+12]
	ciphertext := data[keySize+12:]

	aesKey, err := rsa.DecryptOAEP(sha256.New(), cryptorand.Reader, privKey, encryptedKey, nil)
	if err != nil {
		return nil, fmt.Errorf("decrypting aes key: %w", err)
	}

	block, err := aes.NewCipher(aesKey)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	return gcm.Open(nil, nonce, ciphertext, nil)
}

func TestOpenDefenderRealProtocolCompatibility(t *testing.T) {
	sink := &testSink{}
	norm := normalizer.NewNormalizer(nil)

	// 1. Create Server with in-memory generated keys
	server, err := NewServer("", "", norm, sink)
	if err != nil {
		t.Fatalf("failed to create server: %v", err)
	}

	// 2. Wrap in test HTTP server
	httpSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clean := strings.TrimSuffix(r.URL.Path, "/")
		if clean == "/ws/agent" || clean == "/ws/collector" {
			server.ServeHTTP(w, r)
			return
		}
		http.NotFound(w, r)
	}))
	defer httpSrv.Close()

	wsURL := "ws" + strings.TrimPrefix(httpSrv.URL, "http") + "/ws/collector"

	// Parse server public key from server's base64 method (exactly as open-defender does from config.yaml)
	serverKeyB64 := server.GetPublicKeyBase64()
	serverKeyBytes, err := base64.StdEncoding.DecodeString(serverKeyB64)
	if err != nil {
		t.Fatalf("failed to decode server public key: %v", err)
	}
	serverPublicKey, err := x509.ParsePKCS1PublicKey(serverKeyBytes)
	if err != nil {
		t.Fatalf("failed to parse server PKCS1 public key: %v", err)
	}

	// 3. Simulate Open Defender Agent session key generation
	agentPrivKey, err := rsa.GenerateKey(cryptorand.Reader, 2048)
	if err != nil {
		t.Fatalf("generating agent session key: %v", err)
	}
	agentPubKeyB64 := base64.StdEncoding.EncodeToString(x509.MarshalPKCS1PublicKey(&agentPrivKey.PublicKey))

	// 4. Dial server
	dialer := &websocket.Dialer{HandshakeTimeout: 5 * time.Second}
	conn, resp, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial failed: %v (response: %v)", err, resp)
	}
	defer conn.Close()

	// 5. Send system/hello (using TextMessage, exactly as Open Defender connector.go line 424 does)
	helloEnv := Envelope{
		Version:         2,
		TaskID:          0,
		Service:         "system",
		Operation:       "hello",
		ConfigurationID: "test-vps-01",
		UserID:          "test-user",
		Payload: json.RawMessage(fmt.Sprintf(`{
			"public_key": %q,
			"agent_version": "v1.3.0"
		}`, agentPubKeyB64)),
	}

	helloBytes, _ := json.Marshal(helloEnv)
	encHello, err := clientEncrypt(serverPublicKey, helloBytes)
	if err != nil {
		t.Fatalf("encrypting hello: %v", err)
	}

	if err := conn.WriteMessage(websocket.TextMessage, encHello); err != nil {
		t.Fatalf("sending hello: %v", err)
	}

	// 6. Receive config/set_config
	_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	_, encSetConfig, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("reading set_config: %v", err)
	}

	decSetConfig, err := clientDecrypt(agentPrivKey, encSetConfig)
	if err != nil {
		t.Fatalf("decrypting set_config: %v", err)
	}

	var setConfigEnv Envelope
	if err := json.Unmarshal(decSetConfig, &setConfigEnv); err != nil {
		t.Fatalf("unmarshaling set_config: %v", err)
	}

	if setConfigEnv.Service != "config" || setConfigEnv.Operation != "set_config" {
		t.Fatalf("unexpected message during handshake: %s/%s", setConfigEnv.Service, setConfigEnv.Operation)
	}

	// 7. Send system/ack
	ackEnv := Envelope{
		Version:         2,
		TaskID:          setConfigEnv.TaskID,
		Service:         "system",
		Operation:       "ack",
		ConfigurationID: "test-vps-01",
		UserID:          "test-user",
		Payload:         json.RawMessage(`{"status":"ok","error":""}`),
	}
	ackBytes, _ := json.Marshal(ackEnv)
	encAck, err := clientEncrypt(serverPublicKey, ackBytes)
	if err != nil {
		t.Fatalf("encrypting ack: %v", err)
	}
	if err := conn.WriteMessage(websocket.TextMessage, encAck); err != nil {
		t.Fatalf("sending ack: %v", err)
	}

	// 8. Send alert/raised with real Open Defender events
	alertEnv := Envelope{
		Version:         2,
		TaskID:          0,
		Service:         "alert",
		Operation:       "raised",
		ConfigurationID: "test-vps-01",
		UserID:          "test-user",
		Payload: json.RawMessage(`{
			"events": [
				{
					"source": "ssh_monitor",
					"ip": "198.51.100.23",
					"message": "ssh_monitor -> found offenders ip 198.51.100.23 while scanning syslog: /var/log/auth.log-sshd",
					"happened_at": "2026-09-23T12:00:00Z",
					"details": {
						"engine": "syslog",
						"source": "/var/log/auth.log"
					}
				},
				{
					"source": "ip_ban",
					"ip": "198.51.100.23",
					"message": "ip 198.51.100.23 banned by firewall for 900 seconds",
					"happened_at": "2026-09-23T12:00:05Z"
				}
			]
		}`),
	}

	alertBytes, _ := json.Marshal(alertEnv)
	encAlert, err := clientEncrypt(serverPublicKey, alertBytes)
	if err != nil {
		t.Fatalf("encrypting alert: %v", err)
	}
	if err := conn.WriteMessage(websocket.TextMessage, encAlert); err != nil {
		t.Fatalf("sending alert: %v", err)
	}

	// 9. Allow event processing
	time.Sleep(300 * time.Millisecond)

	if count := sink.count(); count != 2 {
		t.Fatalf("expected 2 ingested events in sink, got %d", count)
	}

	sink.mu.Lock()
	e1 := sink.events[0]
	e2 := sink.events[1]
	sink.mu.Unlock()

	if e1.SourceIP != "198.51.100.23" || e1.EventType != "ssh_brute" || e1.Service != "ssh" {
		t.Errorf("unexpected event 1: %+v", e1)
	}
	if e2.SourceIP != "198.51.100.23" || e2.EventType != "ip_ban" || e2.Action != model.ActionBlocked {
		t.Errorf("unexpected event 2: %+v", e2)
	}
}
