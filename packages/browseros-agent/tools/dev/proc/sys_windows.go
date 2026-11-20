//go:build windows

package proc

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"

	"golang.org/x/sys/windows"
)

// Windows has no POSIX process groups or signals. The supervisor models a
// "process group" as the tree rooted at the recorded PID and tears it down
// with taskkill /T. Console children such as bun and cargo ignore the
// WM_CLOSE a non-forced taskkill sends, so every termination is forced: the
// graceful SIGTERM window the Unix path gets does not exist here.

const stillActive = 259

// setChildProcAttrs starts the child in a new console process group, the
// Windows analogue of Setpgid: Ctrl+C in the terminal reaches the supervisor,
// which then owns shutting the child tree down.
func setChildProcAttrs(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP}
}

func taskkillTree(pid int) error {
	if !pidAlive(pid) {
		return nil
	}
	out, err := exec.Command("taskkill", "/T", "/F", "/PID", strconv.Itoa(pid)).CombinedOutput()
	if err != nil && pidAlive(pid) {
		return fmt.Errorf("taskkill %d: %v: %s", pid, err, strings.TrimSpace(string(out)))
	}
	return nil
}

func killTree(pid int, _ syscall.Signal) error {
	return taskkillTree(pid)
}

func killPID(pid int, _ syscall.Signal) error {
	return taskkillTree(pid)
}

func killGroup(pgid int, _ syscall.Signal) error {
	return taskkillTree(pgid)
}

func pidAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	handle, err := syscall.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(pid))
	if err != nil {
		// Access denied still means the process exists.
		return errors.Is(err, syscall.ERROR_ACCESS_DENIED)
	}
	defer syscall.CloseHandle(handle)
	var code uint32
	if err := syscall.GetExitCodeProcess(handle, &code); err != nil {
		return false
	}
	return code == stillActive
}

// groupAlive approximates the Unix group probe with the tree root's liveness.
func groupAlive(pgid int) bool {
	return pidAlive(pgid)
}

func currentPGID() (int, error) {
	return os.Getpid(), nil
}

// lockFileExclusive uses LockFileEx, which, like flock, is released by the OS
// when the owning process dies, so a crashed supervisor never strands a lock.
func lockFileExclusive(file *os.File) error {
	overlapped := new(windows.Overlapped)
	err := windows.LockFileEx(windows.Handle(file.Fd()),
		windows.LOCKFILE_EXCLUSIVE_LOCK|windows.LOCKFILE_FAIL_IMMEDIATELY, 0, 1, 0, overlapped)
	if err != nil {
		if errors.Is(err, windows.ERROR_LOCK_VIOLATION) || errors.Is(err, windows.ERROR_IO_PENDING) {
			return errWatchRunLocked
		}
		return err
	}
	return nil
}

func unlockFile(file *os.File) error {
	overlapped := new(windows.Overlapped)
	return windows.UnlockFileEx(windows.Handle(file.Fd()), 0, 1, 0, overlapped)
}

// listProcesses returns "pid pgid command" lines in the same shape as Unix ps
// output, so the shared browser-profile parser works unchanged. Windows has no
// pgid; 0 fills the column.
func listProcesses() (string, error) {
	script := `Get-CimInstance Win32_Process | ForEach-Object { if ($_.CommandLine) { "$($_.ProcessId) 0 $($_.CommandLine -replace '[\r\n]+',' ')" } }`
	output, err := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", script).Output()
	if err != nil {
		return "", fmt.Errorf("listing processes: %w", err)
	}
	return string(output), nil
}

// KillPort force-kills every process listening on the TCP port, as found by netstat.
func KillPort(port int) {
	output, err := exec.Command("netstat", "-ano", "-p", "TCP").Output()
	if err != nil {
		return
	}
	for _, pid := range listeningPIDs(string(output), port) {
		_ = exec.Command("taskkill", "/T", "/F", "/PID", strconv.Itoa(pid)).Run()
	}
}

func listeningPIDs(netstat string, port int) []int {
	suffix := ":" + strconv.Itoa(port)
	seen := map[int]bool{}
	var pids []int
	scanner := bufio.NewScanner(strings.NewReader(netstat))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 5 || !strings.EqualFold(fields[3], "LISTENING") || !strings.HasSuffix(fields[1], suffix) {
			continue
		}
		pid, err := strconv.Atoi(fields[4])
		if err != nil || pid <= 0 || seen[pid] {
			continue
		}
		seen[pid] = true
		pids = append(pids, pid)
	}
	return pids
}
