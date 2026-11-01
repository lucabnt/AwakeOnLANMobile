#include "a_wake_on_lan.h"

// Keep the existing fallback for compatibility. Prefer an explicit LAN broadcast address.
#define DEFAULT_IPV4_BCAST "192.255.255.255"
#define DEFAULT_IPV6_MCAST "ff02::1"

AWakeOnLAN::AWakeOnLAN(const char *ip, const char *port_arg, const char *mac_arg,
                       const char *password, bool ipv6)
{
    SetIPAddr(ip, ipv6);
    SetPort(port_arg);
    SetMac(mac_arg);
    if (password) SetPasswd(password);
    CreateMagicPacket();
    ConfigSocketSettings();
}

void AWakeOnLAN::SetIPAddr(const char *ip, bool ipv6)
{
    if (!ip) ip_addr = ipv6 ? DEFAULT_IPV6_MCAST : DEFAULT_IPV4_BCAST;
    else
    {
        const int version = DetermineIPVersion(ip);
        if (version == -1) throw std::invalid_argument("Invalid IP address.");
        ipv6 = version == 6;
        ip_addr = ip;
    }
    domain = ipv6 ? AF_INET6 : AF_INET;
}

void AWakeOnLAN::SetPort(const char *input)
{
    port = input ? static_cast<int>(ParseDecimal(input, 1, 65535)) : DEFAULT_PORT;
}

void AWakeOnLAN::SetMac(const char *input)
{
    if (!ValidateMACAddr(input)) throw std::invalid_argument("Invalid MAC address.");
    std::string compact;
    for (const char *p = input; *p; ++p)
        if (*p != ':' && *p != '-') compact.push_back(*p);
    HexStringToBytesVec(compact, mac);
}

void AWakeOnLAN::SetPasswd(const char *input)
{
    // Preserve the existing raw UTF-8 password format; bound the UDP payload.
    const size_t length = std::strlen(input);
    if (length > 1024) throw std::invalid_argument("Password exceeds 1024 bytes.");
    passwd.assign(input, input + length);
}

void AWakeOnLAN::CreateMagicPacket()
{
    magic_packet.assign(6, 255);
    for (int i = 0; i < 16; ++i) magic_packet.insert(magic_packet.end(), mac.begin(), mac.end());
    magic_packet.insert(magic_packet.end(), passwd.begin(), passwd.end());
}

void AWakeOnLAN::ConfigSocketSettings()
{
    socket_fd.reset(socket(domain, SOCK_DGRAM, IPPROTO_UDP));
    if (socket_fd.get() < 0) throw std::system_error(errno, std::system_category(), "Could not create WOL socket.");
    if (domain == AF_INET)
    {
        int enable = 1;
        if (setsockopt(socket_fd.get(), SOL_SOCKET, SO_BROADCAST, &enable, sizeof(enable)) < 0)
            throw std::system_error(errno, std::system_category(), "Could not enable broadcast.");
        server_address.sin_family = AF_INET;
        server_address.sin_port = htons(port);
        inet_pton(AF_INET, ip_addr.c_str(), &server_address.sin_addr);
    }
    else
    {
        server_address_v6.sin6_family = AF_INET6;
        server_address_v6.sin6_port = htons(port);
        inet_pton(AF_INET6, ip_addr.c_str(), &server_address_v6.sin6_addr);
    }
}

void AWakeOnLAN::SendMagicPacket()
{
    const sockaddr *address = domain == AF_INET ? reinterpret_cast<sockaddr *>(&server_address)
                                               : reinterpret_cast<sockaddr *>(&server_address_v6);
    const socklen_t length = domain == AF_INET ? sizeof(server_address) : sizeof(server_address_v6);
    const ssize_t sent = sendto(socket_fd.get(), magic_packet.data(), magic_packet.size(), 0, address, length);
    if (sent < 0) throw std::system_error(errno, std::system_category(), "Could not send WOL packet.");
    if (static_cast<size_t>(sent) != magic_packet.size()) throw std::runtime_error("Incomplete WOL packet.");
}
