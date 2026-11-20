//go:build windows

package browser

import (
	"os"
	"path/filepath"
)

// The Chromium installer puts per-user installs under
// %LOCALAPPDATA%\<product>\Application and system installs under
// %ProgramFiles%\<product>\Application. The executable keeps either the
// product name or Chromium's chrome.exe, so both are probed. When nothing is
// installed the first candidate is returned so error messages name a real
// expected location; BROWSEROS_BINARY overrides all of this.

func defaultBrowserOSBinaryPath() string {
	return firstExisting(windowsCandidates("BrowserOS", "BrowserOS.exe"))
}

func defaultBrowserClawBinaryPath() string {
	return firstExisting(windowsCandidates("BrowserOS neo", "BrowserOS neo.exe"))
}

func windowsCandidates(productDir string, exe string) []string {
	var roots []string
	for _, key := range []string{"LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)"} {
		if root := os.Getenv(key); root != "" {
			roots = append(roots, root)
		}
	}
	var candidates []string
	for _, root := range roots {
		appDir := filepath.Join(root, productDir, "Application")
		candidates = append(candidates,
			filepath.Join(appDir, exe),
			filepath.Join(appDir, "chrome.exe"),
		)
	}
	return candidates
}

func firstExisting(candidates []string) string {
	for _, candidate := range candidates {
		if binaryExists(candidate) {
			return candidate
		}
	}
	if len(candidates) > 0 {
		return candidates[0]
	}
	return ""
}
