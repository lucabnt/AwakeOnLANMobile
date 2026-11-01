#include "utils.h"
#include <cstring>

int DetermineIPVersion(const char *src)
{
    if (!src) return -1;
    unsigned char buf[sizeof(in6_addr)];
    if (inet_pton(AF_INET, src, buf) == 1) return 4;
    if (inet_pton(AF_INET6, src, buf) == 1) return 6;
    return -1;
}

bool ValidateMACAddr(const char *input)
{
    if (!input) return false;
    const size_t length = std::strlen(input);
    if (length != 12 && length != 17) return false;
    const char separator = length == 17 ? input[2] : '\0';
    if (length == 17 && separator != ':' && separator != '-') return false;
    for (size_t i = 0; i < length; ++i)
    {
        if (length == 17 && i % 3 == 2)
        {
            if (input[i] != separator) return false;
        }
        else if (!((input[i] >= '0' && input[i] <= '9') ||
                   (input[i] >= 'a' && input[i] <= 'f') ||
                   (input[i] >= 'A' && input[i] <= 'F'))) return false;
    }
    return true;
}

uint32_t ParseDecimal(const std::string &input, uint32_t min, uint32_t max)
{
    if (input.empty() || input.size() > 10) throw std::invalid_argument("Invalid decimal value.");
    uint64_t value = 0;
    for (char c : input)
    {
        if (c < '0' || c > '9') throw std::invalid_argument("Invalid decimal value.");
        value = value * 10 + (c - '0');
        if (value > max) throw std::invalid_argument("Decimal value out of range.");
    }
    if (value < min) throw std::invalid_argument("Decimal value out of range.");
    return static_cast<uint32_t>(value);
}

uint8_t HexDigitToUint8(char c)
{
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    throw std::invalid_argument("Invalid hex character.");
}

void HexStringToBytesVec(const std::string &input, std::vector<uint8_t> &bytes)
{
    if (input.size() % 2 != 0) throw std::invalid_argument("Incomplete hex byte.");
    std::vector<uint8_t> parsed;
    for (size_t i = 0; i < input.size(); i += 2)
        parsed.push_back((HexDigitToUint8(input[i]) << 4) | HexDigitToUint8(input[i + 1]));
    bytes = std::move(parsed);
}
