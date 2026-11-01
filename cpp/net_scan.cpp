#include "net_scan.h"
#include <cerrno>
#include <csignal>
#include <fcntl.h>
#include <poll.h>
#include <sys/wait.h>
#include <thread>

void ScanControl::Check() const
{
    if (cancelled) throw std::runtime_error("Scan cancelled.");
    if (std::chrono::steady_clock::now() >= deadline)
        throw std::runtime_error("Scan exceeded the 30-second limit. Try a smaller subnet.");
}

uint32_t IPAddrStrToUInt32(const char *input)
{
    uint32_t address = 0;
    if (!input || inet_pton(AF_INET, input, &address) != 1)
        throw std::invalid_argument("Invalid IPv4 address.");
    return ntohl(address);
}

void SplitCIDR(const std::string &input, size_t slash, std::string &ip, int &prefix)
{
    if (slash == std::string::npos || slash > 15) throw std::invalid_argument("Invalid CIDR address.");
    ip = input.substr(0, slash);
    IPAddrStrToUInt32(ip.c_str());
    prefix = static_cast<int>(ParseDecimal(input.substr(slash + 1), 24, 32));
}

void DetermineIPRange(int prefix, uint32_t &start, uint32_t &end)
{
    if (prefix < 24 || prefix > 32) throw std::invalid_argument("Use a subnet from /24 to /32 (256 addresses maximum).");
    const uint32_t mask = prefix == 32 ? UINT32_MAX : UINT32_MAX << (32 - prefix);
    start &= mask;
    end = start | ~mask;
}

bool NetScan::PingCheck(uint32_t ip)
{
    control_->Check();
    in_addr address{htonl(ip)};
    char text[INET_ADDRSTRLEN]{};
    if (!inet_ntop(AF_INET, &address, text, sizeof(text))) throw std::runtime_error("Invalid IPv4 address.");
    // Spawn ping with literal arguments, without a shell. Always reap the child.
    char executable[] = "ping", count[] = "-c", one[] = "1", timeout[] = "-W";
    char *args[] = {executable, count, one, timeout, one, text, nullptr};
    // fork/exec works on Android API 24; posix_spawn requires API 28 there.
    const pid_t pid = fork();
    if (pid < 0) throw std::system_error(errno, std::system_category(), "Could not start ping.");
    if (pid == 0)
    {
        // Only async-signal-safe functions after fork in this multithreaded process.
        const int sink = open("/dev/null", O_WRONLY);
        if (sink < 0 || dup2(sink, STDOUT_FILENO) < 0 || dup2(sink, STDERR_FILENO) < 0) _exit(127);
        if (sink > STDERR_FILENO) close(sink);
#ifdef __ANDROID__
        execv("/system/bin/ping", args);
#else
        execv("/bin/ping", args);
#endif
        _exit(127);
    }
    const auto timeout_at = std::chrono::steady_clock::now() + std::chrono::milliseconds(1500);
    try
    {
        while (true)
        {
            control_->Check();
            int status = 0;
            const pid_t result = waitpid(pid, &status, WNOHANG);
            if (result == pid) return WIFEXITED(status) && WEXITSTATUS(status) == 0;
            if (result < 0 && errno != EINTR) throw std::runtime_error("Could not wait for ping.");
            if (std::chrono::steady_clock::now() >= timeout_at) break;
            std::this_thread::sleep_for(std::chrono::milliseconds(20));
        }
    }
    catch (...)
    {
        kill(pid, SIGKILL);
        while (waitpid(pid, nullptr, 0) < 0 && errno == EINTR) {}
        throw;
    }
    kill(pid, SIGKILL);
    while (waitpid(pid, nullptr, 0) < 0 && errno == EINTR) {}
    return false;
}

bool NetScan::ConnectCheck(uint32_t ip)
{
    control_->Check();
    SocketHandle socket_fd(socket(AF_INET, SOCK_STREAM, 0));
    if (socket_fd.get() < 0) throw std::system_error(errno, std::system_category(), "Could not create scan socket.");
    const int flags = fcntl(socket_fd.get(), F_GETFL, 0);
    if (flags < 0 || fcntl(socket_fd.get(), F_SETFL, flags | O_NONBLOCK) < 0)
        throw std::system_error(errno, std::system_category(), "Could not configure scan socket.");
    sockaddr_in address{};
    address.sin_family = AF_INET;
    address.sin_port = htons(443);
    address.sin_addr.s_addr = htonl(ip);
    const int result = connect(socket_fd.get(), reinterpret_cast<sockaddr *>(&address), sizeof(address));
    if (result == 0) return true;
    if (errno == ECONNREFUSED) return true;
    if (errno != EINPROGRESS) return false;
    pollfd descriptor{socket_fd.get(), POLLOUT, 0};
    // Poll in short intervals so cancellation does not wait for kernel TCP retries.
    for (int i = 0; i < 5; ++i)
    {
        control_->Check();
        const int ready = poll(&descriptor, 1, 20);
        if (ready < 0)
        {
            if (errno == EINTR) continue;
            throw std::system_error(errno, std::system_category(), "Could not poll scan socket.");
        }
        if (ready > 0)
        {
            int error = 0;
            socklen_t length = sizeof(error);
            if (getsockopt(socket_fd.get(), SOL_SOCKET, SO_ERROR, &error, &length) < 0)
                throw std::system_error(errno, std::system_category(), "Could not inspect scan socket.");
            return error == 0 || error == ECONNREFUSED;
        }
    }
    return false; // A timeout does not establish that a host is up.
}

std::vector<std::vector<std::string>> NetScan::DetermineAndRunOperation(const std::string &input, Mode mode)
{
    if (input.find('\0') != std::string::npos) throw std::invalid_argument("Invalid IPv4 address.");
    const size_t slash = input.find('/');
    uint32_t start, end;
    if (slash == std::string::npos) start = end = IPAddrStrToUInt32(input.c_str());
    else
    {
        std::string ip;
        int prefix;
        SplitCIDR(input, slash, ip, prefix);
        start = end = IPAddrStrToUInt32(ip.c_str());
        DetermineIPRange(prefix, start, end);
    }
    std::vector<std::vector<std::string>> hosts;
    // Use a 64-bit counter to include the final address without IPv4 wraparound.
    for (uint64_t ip = start; ip <= end; ++ip)
    {
        control_->Check();
        const bool found = mode == Mode::PING ? PingCheck(static_cast<uint32_t>(ip)) : ConnectCheck(static_cast<uint32_t>(ip));
        if (found)
        {
            in_addr address{htonl(static_cast<uint32_t>(ip))};
            char text[INET_ADDRSTRLEN]{};
            if (!inet_ntop(AF_INET, &address, text, sizeof(text))) throw std::runtime_error("Invalid IPv4 address.");
            // Reverse DNS has no portable bounded timeout; don't let it stall cancellation.
            hosts.push_back({text, ""});
        }
    }
    return hosts;
}
