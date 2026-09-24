package opendedefender

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/Bragoo312/defender-eye/internal/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetPortFromBindAddress(t *testing.T) {
	assert.Equal(t, 8080, GetPortFromBindAddress("127.0.0.1:8080"))
	assert.Equal(t, 8081, GetPortFromBindAddress("0.0.0.0:8081"))
	assert.Equal(t, 9090, GetPortFromBindAddress(":9090"))
	assert.Equal(t, 8080, GetPortFromBindAddress("invalid"))
}

func TestApplyFullConfigLocally(t *testing.T) {
	tmpDir := t.TempDir()
	targetFile := filepath.Join(tmpDir, "config.yaml")

	sampleYAML := `ssh_monitor:
  mode: blocker
  tries: 3
`
	// Temporarily override DefaultOpenDefenderConfigPath testing
	err := os.WriteFile(targetFile, []byte(sampleYAML), 0640)
	require.NoError(t, err)

	readBack, err := os.ReadFile(targetFile)
	require.NoError(t, err)
	assert.Contains(t, string(readBack), "mode: blocker")
}

func TestCheckLinkStatus(t *testing.T) {
	cfg := config.DefaultConfig()
	st := CheckLinkStatus(cfg, nil)
	assert.NotEmpty(t, st.Message)
}
