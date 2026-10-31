// Research helper: sync and advise eviction of only the supplied artifact.
// Advisory page-cache eviction is not a guarantee of physical disk IO.
#include <fcntl.h>
#include <stdio.h>
#include <unistd.h>
int main(int argc, char **argv) {
  if (argc != 2) return 2;
  int fd = open(argv[1], O_RDONLY);
  if (fd < 0) { perror("open"); return 1; }
  if (fsync(fd) != 0) { perror("fsync"); close(fd); return 1; }
  int result = posix_fadvise(fd, 0, 0, POSIX_FADV_DONTNEED);
  close(fd);
  printf("fsync + POSIX_FADV_DONTNEED: %d\n", result);
  return result != 0;
}
