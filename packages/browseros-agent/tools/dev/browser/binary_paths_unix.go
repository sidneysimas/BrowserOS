//go:build !windows

package browser

func defaultBrowserOSBinaryPath() string {
	return "/Applications/BrowserOS.app/Contents/MacOS/BrowserOS"
}

func defaultBrowserClawBinaryPath() string {
	return "/Applications/BrowserOS neo.app/Contents/MacOS/BrowserOS neo"
}
