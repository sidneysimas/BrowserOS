//go:build windows

package proc

import (
	"reflect"
	"testing"
)

func TestListeningPIDsMatchesOnlyListenersOnThePort(t *testing.T) {
	netstat := `
Active Connections

  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:9200           0.0.0.0:0              LISTENING       4242
  TCP    [::]:9200              [::]:0                 LISTENING       4242
  TCP    127.0.0.1:19200        0.0.0.0:0              LISTENING       77
  TCP    127.0.0.1:9200         127.0.0.1:50000        ESTABLISHED     88
  TCP    127.0.0.1:9201         0.0.0.0:0              LISTENING       99
`
	got := listeningPIDs(netstat, 9200)
	if want := []int{4242}; !reflect.DeepEqual(got, want) {
		t.Fatalf("listeningPIDs = %v, want %v", got, want)
	}
}

func TestPIDAliveSeesCurrentProcess(t *testing.T) {
	pid, _ := currentPGID()
	if !pidAlive(pid) {
		t.Fatalf("current process %d reported dead", pid)
	}
	if pidAlive(0) {
		t.Fatal("pid 0 reported alive")
	}
}
