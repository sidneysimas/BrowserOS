package cmd

import (
	"path/filepath"

	"browseros-dev/proc"
)

func writeServerSidecarConfig(path string, root string, executionDir string, p proc.Ports) error {
	return proc.WriteSidecarConfig(path, proc.SidecarConfigOptions{
		Ports:        p,
		ResourcesDir: filepath.Join(root, "resources"),
		ExecutionDir: executionDir,
	})
}

func watchSidecarConfigPath(userDataDir string, name string) string {
	return filepath.Join(userDataDir, "sidecars", name+".json")
}
