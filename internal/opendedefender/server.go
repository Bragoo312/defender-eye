package opendedefender

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/Bragoo312/defender-eye/internal/model"
	"github.com/Bragoo312/defender-eye/internal/normalizer"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Localhost or reverse proxy access
	},
	ReadBufferSize:  1024 * 1024,
	WriteBufferSize: 1024 * 1024,
}

type EventSink interface {
	HandleEvent(event model.SecurityEvent)
}

type Server struct {
	privateKey   *rsa.PrivateKey
	publicKey    *rsa.PublicKey
	normalizer   *normalizer.Normalizer
	sink         EventSink
	sessions     map[*session]bool
	agentConfigs map[string]json.RawMessage
	mu           sync.Mutex
}

type session struct {
	conn       *websocket.Conn
	agentKey   *rsa.PublicKey
	agentVer   string
	configID   string
	userID     string
	server     *Server
	writeMutex sync.Mutex
}

type Envelope struct {
	Version         int             `json:"version"`
	TaskID          int64           `json:"task_id"`
	Service         string          `json:"service"`
	Operation       string          `json:"operation"`
	ConfigurationID string          `json:"configuration_id"`
	UserID          string          `json:"user_id"`
	Payload         json.RawMessage `json:"payload"`
}

type HelloPayload struct {
	PublicKey    string `json:"public_key"`
	AgentVersion string `json:"agent_version"`
}

type AlertRaisedPayload struct {
	Events []struct {
		Source     string                 `json:"source"`
		IP         string                 `json:"ip"`
		Message    string                 `json:"message"`
		HappenedAt string                 `json:"happened_at"`
		Severity   string                 `json:"severity,omitempty"`
		Details    map[string]interface{} `json:"details,omitempty"`
	} `json:"events"`
}

func NewServer(privKeyPath, pubKeyPath string, norm *normalizer.Normalizer, sink EventSink) (*Server, error) {
	privKey, pubKey, err := loadOrGenerateKeys(privKeyPath, pubKeyPath)
	if err != nil {
		return nil, fmt.Errorf("loading/generating server RSA keys: %w", err)
	}

	return &Server{
		privateKey:   privKey,
		publicKey:    pubKey,
		normalizer:   norm,
		sink:         sink,
		sessions:     make(map[*session]bool),
		agentConfigs: make(map[string]json.RawMessage),
	}, nil
}

func (s *Server) saveAgentConfig(configID string, cfg json.RawMessage) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.agentConfigs[configID] = cfg
}

func (s *Server) getAgentConfig(configID string) json.RawMessage {
	s.mu.Lock()
	defer s.mu.Unlock()
	if cfg, ok := s.agentConfigs[configID]; ok && len(cfg) > 0 {
		return cfg
	}
	return json.RawMessage(`{"config":{}}`)
}

func (s *Server) GetPublicKeyBase64() string {
	bytes := x509.MarshalPKCS1PublicKey(s.publicKey)
	return base64.StdEncoding.EncodeToString(bytes)
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[OpenDefender-WS] Upgrade error: %v", err)
		return
	}

	sess := &session{
		conn:   conn,
		server: s,
	}

	s.mu.Lock()
	s.sessions[sess] = true
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		delete(s.sessions, sess)
		s.mu.Unlock()
		_ = conn.Close()
	}()

	log.Printf("[OpenDefender-WS] New connection from %s", conn.RemoteAddr().String())
	sess.run()
}

func (sess *session) run() {
	// Handshake timeout: agent must send hello and complete handshake within 30 s
	_ = sess.conn.SetReadDeadline(time.Now().Add(30 * time.Second))

	// Refresh read deadline upon receiving client pong
	sess.conn.SetPongHandler(func(string) error {
		_ = sess.conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		return nil
	})

	// Ping ticker: Open Defender expects server ping every 30 s and disconnects if idle > 90 s
	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()

	go func() {
		for range ticker.C {
			sess.writeMutex.Lock()
			_ = sess.conn.WriteControl(websocket.PingMessage, []byte{}, time.Now().Add(5*time.Second))
			sess.writeMutex.Unlock()
		}
	}()

	for {
		messageType, data, err := sess.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[OpenDefender-WS] Connection error: %v", err)
			}
			break
		}

		// Open Defender transmits encrypted frames via TextMessage; also accept BinaryMessage for robustness
		if messageType != websocket.BinaryMessage && messageType != websocket.TextMessage {
			continue
		}

		// Reset deadline on incoming frame
		_ = sess.conn.SetReadDeadline(time.Now().Add(90 * time.Second))

		plainText, err := sess.server.decryptMessage(data)
		if err != nil {
			log.Printf("[OpenDefender-WS] Decrypt error: %v", err)
			continue
		}

		var env Envelope
		if err := json.Unmarshal(plainText, &env); err != nil {
			log.Printf("[OpenDefender-WS] JSON envelope unmarshal error: %v", err)
			continue
		}

		if err := sess.handleEnvelope(env); err != nil {
			log.Printf("[OpenDefender-WS] Handle error: %v", err)
		}
	}
}

func (sess *session) handleEnvelope(env Envelope) error {
	switch env.Service + "/" + env.Operation {
	case "system/hello":
		var hello HelloPayload
		if err := json.Unmarshal(env.Payload, &hello); err != nil {
			return fmt.Errorf("parsing hello payload: %w", err)
		}

		keyBytes, err := base64.StdEncoding.DecodeString(hello.PublicKey)
		if err != nil {
			return fmt.Errorf("decoding agent public key base64: %w", err)
		}

		agentKey, err := x509.ParsePKCS1PublicKey(keyBytes)
		if err != nil {
			return fmt.Errorf("parsing agent PKCS1 public key: %w", err)
		}

		sess.agentKey = agentKey
		sess.agentVer = hello.AgentVersion
		sess.configID = env.ConfigurationID
		sess.userID = env.UserID

		log.Printf("[OpenDefender-WS] Agent connected: version=%s, user=%s, config_id=%s",
			sess.agentVer, sess.userID, sess.configID)

		// Must reply with config/set_config within 30 seconds
		return sess.sendSetConfig(env.TaskID)

	case "system/ack":
		var ack struct {
			Status string `json:"status"`
			Error  string `json:"error"`
		}
		_ = json.Unmarshal(env.Payload, &ack)
		if ack.Status == "error" {
			log.Printf("[OpenDefender-WS] Agent %s reported error in ack (task_id=%d): %s",
				sess.configID, env.TaskID, ack.Error)
		} else {
			log.Printf("[OpenDefender-WS] Handshake established with agent %s (task_id=%d). Session active.",
				sess.configID, env.TaskID)
			// Proactively request running config so we maintain parity with agent without forced restarts
			go func() {
				time.Sleep(300 * time.Millisecond)
				_ = sess.sendGetConfig(101)
			}()
		}
		return nil

	case "config/config":
		var cfgPayload struct {
			Config json.RawMessage `json:"config"`
		}
		if err := json.Unmarshal(env.Payload, &cfgPayload); err == nil && len(cfgPayload.Config) > 0 {
			sess.server.saveAgentConfig(sess.configID, env.Payload)
			log.Printf("[OpenDefender-WS] Synchronized running config for agent %s (%d bytes)",
				sess.configID, len(cfgPayload.Config))
		}
		return nil

	case "alert/raised":
		var alert AlertRaisedPayload
		if err := json.Unmarshal(env.Payload, &alert); err != nil {
			return fmt.Errorf("parsing alert payload: %w", err)
		}

		for _, item := range alert.Events {
			rawJSON, _ := json.Marshal(item)
			input := normalizer.IngestEventInput{
				Source:     "open_defender",
				Monitor:    item.Source,
				IP:         item.IP,
				Message:    item.Message,
				HappenedAt: item.HappenedAt,
				Severity:   item.Severity,
				Details:    item.Details,
			}
			normEvent := sess.server.normalizer.Normalize(input)
			normEvent.RawData = string(rawJSON)

			if sess.server.sink != nil {
				sess.server.sink.HandleEvent(normEvent)
			}
		}
		return nil

	default:
		log.Printf("[OpenDefender-WS] Ignored operation %s/%s", env.Service, env.Operation)
		return nil
	}
}

func (sess *session) sendSetConfig(taskID int64) error {
	if sess.agentKey == nil {
		return errors.New("no agent public key for session")
	}

	payloadRaw := sess.server.getAgentConfig(sess.configID)

	replyEnv := Envelope{
		Version:         2,
		TaskID:          taskID,
		Service:         "config",
		Operation:       "set_config",
		ConfigurationID: sess.configID,
		UserID:          sess.userID,
		Payload:         payloadRaw,
	}

	payloadBytes, err := json.Marshal(replyEnv)
	if err != nil {
		return err
	}

	encryptedFrame, err := sess.encryptForAgent(payloadBytes)
	if err != nil {
		return fmt.Errorf("encrypting set_config: %w", err)
	}

	sess.writeMutex.Lock()
	defer sess.writeMutex.Unlock()
	return sess.conn.WriteMessage(websocket.TextMessage, encryptedFrame)
}

func (sess *session) sendGetConfig(taskID int64) error {
	if sess.agentKey == nil {
		return errors.New("no agent public key for session")
	}

	reqEnv := Envelope{
		Version:         2,
		TaskID:          taskID,
		Service:         "config",
		Operation:       "get_config",
		ConfigurationID: sess.configID,
		UserID:          sess.userID,
		Payload:         json.RawMessage(`{}`),
	}

	payloadBytes, err := json.Marshal(reqEnv)
	if err != nil {
		return err
	}

	encryptedFrame, err := sess.encryptForAgent(payloadBytes)
	if err != nil {
		return fmt.Errorf("encrypting get_config: %w", err)
	}

	sess.writeMutex.Lock()
	defer sess.writeMutex.Unlock()
	return sess.conn.WriteMessage(websocket.TextMessage, encryptedFrame)
}

func (s *Server) decryptMessage(frame []byte) ([]byte, error) {
	// Frame layout: [256-byte RSA(aesKey)][12-byte IV][ciphertext + 16-byte tag]
	if len(frame) < 256+12+16 {
		return nil, errors.New("frame is too short to be valid encrypted message")
	}

	encryptedKey := frame[:256]
	iv := frame[256 : 256+12]
	ciphertext := frame[256+12:]

	aesKey, err := rsa.DecryptOAEP(sha256.New(), rand.Reader, s.privateKey, encryptedKey, nil)
	if err != nil {
		return nil, fmt.Errorf("decrypting AES key with RSA-OAEP: %w", err)
	}

	block, err := aes.NewCipher(aesKey)
	if err != nil {
		return nil, fmt.Errorf("creating AES cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("creating GCM: %w", err)
	}

	plainText, err := gcm.Open(nil, iv, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("decrypting payload with AES-GCM: %w", err)
	}

	return plainText, nil
}

func (sess *session) encryptForAgent(plainText []byte) ([]byte, error) {
	aesKey := make([]byte, 32)
	if _, err := rand.Read(aesKey); err != nil {
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

	iv := make([]byte, 12)
	if _, err := rand.Read(iv); err != nil {
		return nil, err
	}

	ciphertext := gcm.Seal(nil, iv, plainText, nil)

	encryptedKey, err := rsa.EncryptOAEP(sha256.New(), rand.Reader, sess.agentKey, aesKey, nil)
	if err != nil {
		return nil, err
	}

	frame := make([]byte, 0, len(encryptedKey)+len(iv)+len(ciphertext))
	frame = append(frame, encryptedKey...)
	frame = append(frame, iv...)
	frame = append(frame, ciphertext...)
	return frame, nil
}

func loadOrGenerateKeys(privPath, pubPath string) (*rsa.PrivateKey, *rsa.PublicKey, error) {
	// If files exist, load them
	if privData, err := os.ReadFile(privPath); err == nil {
		key, err := x509.ParsePKCS1PrivateKey(privData)
		if err == nil {
			return key, &key.PublicKey, nil
		}
	}

	// Generate new RSA-2048 keypair
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, nil, err
	}

	privBytes := x509.MarshalPKCS1PrivateKey(key)
	pubBytes := x509.MarshalPKCS1PublicKey(&key.PublicKey)

	if privPath != "" {
		_ = os.WriteFile(privPath, privBytes, 0600)
	}
	if pubPath != "" {
		_ = os.WriteFile(pubPath, pubBytes, 0644)
	}

	return key, &key.PublicKey, nil
}
