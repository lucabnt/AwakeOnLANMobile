#include "a_wake_on_lan.h"
#include "net_scan.h"
#include <cassert>
#include <cstring>
#include <fcntl.h>
#include <functional>
#include <iostream>
#include <thread>

static void rejects(const std::function<void()> &operation)
{
    bool rejected = false;
    try { operation(); } catch (const std::exception &) { rejected = true; }
    assert(rejected);
}

int main()
{
    assert(!ValidateMACAddr(nullptr));
    for (const char *mac : {"001122aAbBcC", "00:11:22:aa:BB:cc", "00-11-22-AA-bb-cc"}) assert(ValidateMACAddr(mac));
    for (const char *mac : {"", "00:11-22:33:44:55", "001122334455!", "00:11:22:33:44:5g", "001122334455:::::"}) assert(!ValidateMACAddr(mac));
    for (const char *port : {"", "0", "65536", "9abc", "-9", "999999999999999999999", "4294967305"})
        rejects([&] { ParseDecimal(port, 1, 65535); });
    assert(ParseDecimal("65535", 1, 65535) == 65535);
    assert(DetermineIPVersion(nullptr) == -1);
    assert(DetermineIPVersion("::1") == 6);

    for (const char *cidr : {"192.168.1.1/999999999999999999999999", "192.168.1.1/24junk", "192.168.1.1/8", "192.168.1.1/-1", "192.168.1.1/24/24"})
        rejects([&] { std::string ip; int prefix; SplitCIDR(cidr, std::string(cidr).find('/'), ip, prefix); });
    uint32_t start = IPAddrStrToUInt32("255.255.255.255"), end = start;
    DetermineIPRange(32, start, end);
    assert(start == UINT32_MAX && end == UINT32_MAX);
    DetermineIPRange(24, start, end);
    assert(end - start + 1 == 256);
    auto control = std::make_shared<ScanControl>();
    control->cancelled = true;
    rejects([&] { NetScan(control).DetermineAndRunOperation("127.0.0.1", Mode::CONNECT); });
    control->cancelled = false;
    control->deadline = std::chrono::steady_clock::now() - std::chrono::seconds(1);
    rejects([&] { NetScan(control).DetermineAndRunOperation("127.0.0.1", Mode::CONNECT); });

    // /22 bounds and wraparound are valid, /21 is rejected.
    start = end = IPAddrStrToUInt32("255.255.255.255");
    DetermineIPRange(22, start, end);
    assert(static_cast<uint64_t>(end) - start + 1 == 1024);
    rejects([&] { DetermineIPRange(21, start, end); });
    auto benchmark = std::make_shared<ScanControl>();
    auto began = std::chrono::steady_clock::now();
    auto loopback = NetScan(benchmark).DetermineAndRunOperation("127.0.0.1/22", Mode::CONNECT);
    auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - began).count();
    assert(benchmark->completed == 1024 && benchmark->Snapshot()[0][2] == "complete");
    assert(loopback.size() == 1024 && elapsed < 10000);
    std::cout << "1024 loopback TCP addresses: " << elapsed << " ms\n";

    // Reserved benchmark network (198.18.0.0/15): bounded TCP timeout, no public hosts.
    auto bounded = std::make_shared<ScanControl>();
    began = std::chrono::steady_clock::now();
    NetScan(bounded).DetermineAndRunOperation("198.18.0.0/22", Mode::CONNECT);
    elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - began).count();
    assert(bounded->completed == 1024 && elapsed < 15000);
    std::cout << "1024 benchmark-network TCP addresses: " << elapsed << " ms\n";

    auto partial = std::make_shared<ScanControl>();
    partial->deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(250);
    NetScan(partial).DetermineAndRunOperation("198.18.0.0/22", Mode::CONNECT);
    assert(partial->completed < partial->total && partial->Snapshot()[0][2] == "timeout");
    partial = std::make_shared<ScanControl>();
    std::thread cancel([partial] { std::this_thread::sleep_for(std::chrono::milliseconds(200)); partial->cancelled = true; });
    NetScan(partial).DetermineAndRunOperation("198.18.0.0/22", Mode::CONNECT);
    cancel.join();
    assert(partial->completed < partial->total && partial->Snapshot()[0][2] == "cancelled");

    // Empty UI destinations are mapped to nullptr by the native bridge.
    AWakeOnLAN defaults(nullptr, nullptr, "001122334455", nullptr, false);
    assert(defaults.ip_addr == "255.255.255.255" && defaults.port == 9);
    AWakeOnLAN explicitTarget("192.168.1.255", nullptr, "001122334455", nullptr, false);
    assert(explicitTarget.ip_addr == "192.168.1.255");

    // Decode a real datagram sent over loopback and check the exact magic packet.
    SocketHandle receiver(socket(AF_INET, SOCK_DGRAM, 0));
    assert(receiver.get() >= 0);
    sockaddr_in address{};
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    assert(bind(receiver.get(), reinterpret_cast<sockaddr *>(&address), sizeof(address)) == 0);
    socklen_t length = sizeof(address);
    assert(getsockname(receiver.get(), reinterpret_cast<sockaddr *>(&address), &length) == 0);
    timeval timeout{1, 0};
    assert(setsockopt(receiver.get(), SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout)) == 0);
    const auto port = std::to_string(ntohs(address.sin_port));
    const char *mac = "00:11:22:33:44:55"; // Also verifies no attempt to mutate string literals.
    AWakeOnLAN packet("127.0.0.1", port.c_str(), mac, " secret ", false);
    packet.SendMagicPacket();
    unsigned char bytes[128]{};
    assert(recv(receiver.get(), bytes, sizeof(bytes), 0) == 110);
    for (int i = 0; i < 6; ++i) assert(bytes[i] == 255);
    for (int i = 6; i < 102; ++i) assert(bytes[i] == ((i - 6) % 6) * 0x11);
    assert(std::memcmp(bytes + 102, " secret ", 8) == 0);
    rejects([&] { AWakeOnLAN bad("127.0.0.1", "9abc", mac, nullptr, false); });
    rejects([&] { AWakeOnLAN bad("127.0.0.1", "9", nullptr, nullptr, false); });

    // Destruction must not close a descriptor reused after a scan or failed send.
    int survivor = -1;
    {
        NetScan scan;
        scan.ConnectCheck(IPAddrStrToUInt32("127.0.0.1"));
        survivor = socket(AF_INET, SOCK_DGRAM, 0);
    }
    assert(survivor >= 0 && fcntl(survivor, F_GETFD) >= 0);
    close(survivor);
    std::cout << "Native security tests passed\n";
}
