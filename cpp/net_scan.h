#pragma once

#include "utils.h"
#include <atomic>
#include <chrono>
#include <memory>

uint32_t IPAddrStrToUInt32(const char *input);
void SplitCIDR(const std::string &input, size_t slash_pos, std::string &ip, int &prefix);
void DetermineIPRange(int prefix, uint32_t &start, uint32_t &end);

enum class Mode { CONNECT = 0, PING = 1 };

struct ScanControl
{
    std::atomic<bool> cancelled{false};
    std::chrono::steady_clock::time_point deadline =
        std::chrono::steady_clock::now() + std::chrono::seconds(30);
    void Check() const;
};

class NetScan
{
  public:
    explicit NetScan(std::shared_ptr<ScanControl> control = std::make_shared<ScanControl>())
        : control_(std::move(control)) {}
    bool PingCheck(uint32_t ip);
    bool ConnectCheck(uint32_t ip);
    std::vector<std::vector<std::string>> DetermineAndRunOperation(const std::string &input, Mode mode);
  private:
    std::shared_ptr<ScanControl> control_;
};
