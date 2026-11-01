#pragma once

#include <AppSpecsJSI.h>
#include <ReactCommon/CallInvoker.h>
#include <jsi/jsi.h>

#include <chrono>
#include <memory>
#include <string>
#include <thread>
#include <vector>

#include "a_wake_on_lan.h"
#include "net_scan.h"
#include "utils.h"

namespace facebook::react
{

class NativeModule : public NativeModuleCxxSpec<NativeModule>
{
  public:
    NativeModule(std::shared_ptr<CallInvoker> jsInvoker);
    ~NativeModule();

    bool ValidMac(jsi::Runtime &rt, std::string input);

    bool ValidIp(jsi::Runtime &rt, std::string input);

    void SendWOL(jsi::Runtime &rt, std::string mac_addr, std::string ip_addr, std::string port, std::string passwd);

    jsi::Value ScanHosts(jsi::Runtime &rt, std::string input, std::string mode_selected);
    void CancelScan(jsi::Runtime &rt);

  private:
    struct WorkerState
    {
        std::atomic<bool> alive{true};
        std::atomic<bool> running{false};
    };
    std::shared_ptr<WorkerState> workerState_ = std::make_shared<WorkerState>();
    std::shared_ptr<ScanControl> scanControl_;
    std::thread scanThread_;
};

} // namespace facebook::react
