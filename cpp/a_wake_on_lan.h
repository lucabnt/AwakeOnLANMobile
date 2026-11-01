#ifndef A_WAKE_ON_LAN_H
#define A_WAKE_ON_LAN_H

#include "utils.h"
#include <arpa/inet.h>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <system_error>
#include <unistd.h>
#include <vector>

#define DEFAULT_PORT 9

class AWakeOnLAN
{
  public:
    explicit AWakeOnLAN(const char *ip_addr_arg, const char *port_arg, const char *mac_arg,
                        const char *passwd_arg, bool ipv6_toggle);

    void SendMagicPacket();

    // private:
    void SetIPAddr(const char *ip_addr_arg, bool ipv6_toggle_val);

    void ConfigSocketSettings();

    void SetPort(const char *port_arg);

    void SetMac(const char *mac_arg);

    void SetPasswd(const char *passwd_arg);

    void CreateMagicPacket();

    std::string ip_addr;

    int port;

    std::vector<uint8_t> mac;

    std::vector<uint8_t> passwd;

    std::vector<uint8_t> magic_packet;

    int domain;

    SocketHandle socket_fd;

    sockaddr_in server_address{};

    sockaddr_in6 server_address_v6{};
};

#endif
