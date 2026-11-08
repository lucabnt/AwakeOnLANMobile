#include "NativeModule.h"
#include <react/bridging/Array.h>
#include <react/bridging/Promise.h>

namespace facebook::react
{

NativeModule::NativeModule(std::shared_ptr<CallInvoker> jsInvoker) : NativeModuleCxxSpec(std::move(jsInvoker)) {}

NativeModule::~NativeModule()
{
    workerState_->alive = false;
    if (scanControl_) scanControl_->cancelled = true;
    if (scanThread_.joinable()) scanThread_.join();
}

bool NativeModule::ValidMac(jsi::Runtime &, std::string input)
{
    return input.find('\0') == std::string::npos && ValidateMACAddr(input.c_str());
}

bool NativeModule::ValidIp(jsi::Runtime &, std::string input)
{
    const int version = input.find('\0') == std::string::npos ? DetermineIPVersion(input.c_str()) : -1;
    return version == 4 || version == 6;
}

void NativeModule::SendWOL(jsi::Runtime &rt, std::string mac, std::string ip, std::string port, std::string password)
{
    try
    {
        for (const auto *value : {&mac, &ip, &port, &password})
            if (value->find('\0') != std::string::npos) throw std::invalid_argument("NUL characters are not allowed.");
        AWakeOnLAN packet{ip.empty() ? nullptr : ip.c_str(), port.empty() ? nullptr : port.c_str(), mac.c_str(),
                          password.empty() ? nullptr : password.c_str(), false};
        packet.SendMagicPacket();
    }
    catch (const std::exception &error)
    {
        throw jsi::JSError(rt, error.what());
    }
}

std::vector<std::vector<std::string>> NativeModule::ScanProgress(jsi::Runtime &)
{
    return scanControl_ ? scanControl_->Snapshot() : std::vector<std::vector<std::string>>{};
}

void NativeModule::CancelScan(jsi::Runtime &)
{
    if (scanControl_) scanControl_->cancelled = true;
}

jsi::Value NativeModule::ScanHosts(jsi::Runtime &rt, std::string input, std::string mode_selected)
{
    // React Native's AsyncPromise retains callbacks weakly outside the JS thread.
    // Workers never own raw runtime references or JSI values across runtime teardown.
    AsyncPromise<std::vector<std::vector<std::string>>> promise(rt, jsInvoker_);
    auto result = promise.get(rt);
    if (workerState_->running)
    {
        promise.reject(Error("A scan is already running."));
        return result;
    }
    if (mode_selected != "Ping" && mode_selected != "TCP Connect")
    {
        promise.reject(Error("Invalid scan mode."));
        return result;
    }
    if (scanThread_.joinable()) scanThread_.join();
    const Mode mode = mode_selected == "Ping" ? Mode::PING : Mode::CONNECT;
    scanControl_ = std::make_shared<ScanControl>();
    workerState_->running = true;
    try
    {
        scanThread_ = std::thread([promise, input, mode, state = workerState_, control = scanControl_]() mutable {
            std::vector<std::vector<std::string>> hosts;
            std::string error;
            try
            {
                hosts = NetScan(control).DetermineAndRunOperation(input, mode);
            }
            catch (const std::exception &exception)
            {
                error = exception.what();
            }
            catch (...)
            {
                error = "Scan failed.";
            }
            if (!error.empty()) {
                std::lock_guard<std::mutex> lock(control->mutex);
                control->status = control->cancelled ? "cancelled" : "failed";
            }
            state->running = false;
            if (!state->alive) return;
            if (error.empty()) promise.resolve(std::move(hosts));
            else promise.reject(Error(std::move(error)));
        });
    }
    catch (const std::exception &)
    {
        workerState_->running = false;
        promise.reject(Error("Could not start scan."));
    }
    return result;
}

} // namespace facebook::react
