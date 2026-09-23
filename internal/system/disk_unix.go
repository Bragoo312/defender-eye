//go:build !windows

package system

import (
	"fmt"
	"syscall"
)

func getDiskSpace(path string) (total uint64, used uint64, err error) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return 0, 0, err
	}
	if stat.Bsize <= 0 {
		return 0, 0, fmt.Errorf("invalid filesystem block size: %d", stat.Bsize)
	}
	total = stat.Blocks * uint64(stat.Bsize)
	free := stat.Bfree * uint64(stat.Bsize)
	used = total - free
	return total, used, nil
}
