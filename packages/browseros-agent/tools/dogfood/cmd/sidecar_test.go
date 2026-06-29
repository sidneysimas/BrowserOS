package cmd

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"browseros-dogfood/config"
)

func TestWriteDogfoodSidecarConfigWritesPortsAndDirectories(t *testing.T) {
	cfg := config.Config{
		DevUserDataDir: t.TempDir(),
		BrowserOSDir:   "/tmp/browseros-dogfood",
		Ports:          config.Ports{CDP: 9015, Server: 9115, Extension: 9315},
	}
	path := dogfoodSidecarConfigPath(cfg)

	if err := writeDogfoodSidecarConfig(path, cfg, "/repo/packages/browseros-agent"); err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatal(err)
	}

	if path != filepath.Join(cfg.DevUserDataDir, "server-config.json") {
		t.Fatalf("unexpected sidecar path: %s", path)
	}
	ports := got["ports"].(map[string]any)
	if ports["server"] != float64(9115) || ports["cdp"] != float64(9015) || ports["proxy"] != float64(9115) {
		t.Fatalf("unexpected ports: %#v", ports)
	}
	directories := got["directories"].(map[string]any)
	if directories["resources"] != "/repo/packages/browseros-agent/resources" || directories["execution"] != "/tmp/browseros-dogfood" {
		t.Fatalf("unexpected directories: %#v", directories)
	}
}
