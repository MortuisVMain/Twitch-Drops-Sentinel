// Independent MSVC x64 fixture for an eight-byte class returned through a virtual call.
class FixtureId {
public:
    explicit FixtureId(unsigned long long value) : _value(value) {}

private:
    union {
        unsigned long long _value;
        struct { unsigned int first, second; } _parts;
    };
};

class FixtureUser {
public:
    virtual int Handle() { return 22; }
    virtual bool IsOnline() { return true; }
    virtual FixtureId GetId() { return FixtureId(0x011000010000002aULL); }
};

extern "C" __declspec(dllexport) FixtureUser* GetFixtureUser() {
    static FixtureUser user;
    return &user;
}
