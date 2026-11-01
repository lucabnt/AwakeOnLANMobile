#pragma once

#include <arpa/inet.h>
#include <cstdint>
#include <string>
#include <sys/socket.h>
#include <system_error>
#include <unistd.h>
#include <utility>
#include <vector>

// A descriptor has exactly one owner, including during constructor exceptions.
class SocketHandle
{
  public:
    explicit SocketHandle(int fd = -1) : fd_(fd) {}
    ~SocketHandle() { if (fd_ >= 0) close(fd_); }
    SocketHandle(const SocketHandle &) = delete;
    SocketHandle &operator=(const SocketHandle &) = delete;
    int get() const { return fd_; }
    void reset(int fd)
    {
        if (fd_ >= 0) close(fd_);
        fd_ = fd;
    }
  private:
    int fd_;
};

int DetermineIPVersion(const char *src);
bool ValidateMACAddr(const char *mac_addr_str);
uint32_t ParseDecimal(const std::string &input, uint32_t min, uint32_t max);
uint8_t HexDigitToUint8(char str);
void HexStringToBytesVec(const std::string &ascii_string, std::vector<uint8_t> &bytes_vec);
