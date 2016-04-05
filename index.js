var Service, Characteristic;
var JSONRequest = require("jsonrequest");
var inherits = require('util').inherits;

// Get data from config file 
function Domotiga(log, config) {
    this.log = log;
    this.config = {
        host: config.host || 'localhost',
        port: config.port || 9090,
        service: config.service,
        device: config.device,
        manufacturer: config.manufacturer,
        model: config.model,
        valueTemperature: config.valueTemperature,
        valueHumidity: config.valueHumidity,
        valueAirPressure: config.valueAirPressure,
        valueBattery: config.valueBattery,
        valueContact: config.valueContact,
        valueSwitch: config.valueSwitch,
        valueAirQuality: config.valueAirQuality,
        valueOutlet: config.valueOutlet,
        valueLeakSensor: config.valueLeakSensor,
        valueMotionSensor: config.valueMotionSensor,
        valuePowerConsumption: config.valuePowerConsumption,
        valueTotalPowerConsumption: config.valueTotalPowerConsumption,
        name: config.name || NA,
        lowbattery: config.lowbattery
    };
}

//Helpers
var hexToBase64 = function (val) {
    return new Buffer(('' + val).replace(/[^0-9A-F]/ig, ''), 'hex').toString('base64');
}, base64ToHex = function (val) {
    if (!val) return val;
    return new Buffer(val, 'base64').toString('hex');
}, swap16 = function (val) {
    return ((val & 0xFF) << 8)
    | ((val >> 8) & 0xFF);
}, hexToHPA = function (val) {
    return parseInt(swap16(val), 10);
}, hPAtoHex = function (val) {
    return swap16(Math.round(val)).toString(16);
}, numToHex = function (val, len) {
    var s = Number(val).toString(16);
    if (s.length % 2 != 0) {
        s = '0' + s;
    }
    if (len) {
        return ('0000000000000' + s).slice(-1 * len);
    }
    return s;
}

function EveLogEntry(type, id, timestamp, sensorDatapoints) {
    this.type = type;
    this.id = id;
    this.timestamp = timestamp;
    if (type == 0x10) {
        this.sensorDatapoints = sensorDatapoints;
    } else {

    }
}

EveLogEntry.prototype.toHex = function () {
    var bytes = [this.type, this.id, 0x00, 0x00, 0x00, numToHex(parseInt(hPAtoHex(this.timestamp), 16), 4), 0x00, 0x00];

    if (this.type == 0x10) {
        bytes.push((this.sensorDatapoints.length * 2) + 1);
        bytes.push.apply(bytes, this.sensorDatapoints.map(function (s) {
            return hPAtoHex(s);
        }));
    }
    var bytesAsStrings = bytes.map(function (s) { return typeof s === 'string' ? s : numToHex(s); });

    // console.log(bytes, bytesAsStrings)
    return new Buffer(bytesAsStrings.join(''), 'hex').toString('hex');
}


module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    ////////////////////////////// Custom characteristics //////////////////////////////
    EvePowerConsumption = function () {
        Characteristic.call(this, 'Consumption', 'E863F10D-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
            format: Characteristic.Formats.UINT16,
            unit: "watts",
            maxValue: 1000000000,
            minValue: 0,
            minStep: 1,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
        });
        this.value = this.getDefaultValue();
    };
    inherits(EvePowerConsumption, Characteristic);

    EveTotalPowerConsumption = function () {
        Characteristic.call(this, 'Total Consumption', 'E863F10C-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
            format: Characteristic.Formats.FLOAT, // Deviation from Eve Energy observed type
            unit: "kilowatthours",
            maxValue: 1000000000,
            minValue: 0,
            minStep: 0.001,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
        });
        this.value = this.getDefaultValue();
    };
    inherits(EveTotalPowerConsumption, Characteristic);

    EveRoomAirQuality = function () {
        Characteristic.call(this, 'Eve Air Quality', 'E863F10B-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
            format: Characteristic.Formats.UINT16,
            unit: "ppm",
            maxValue: 5000,
            minValue: 0,
            minStep: 1,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
        });
        this.value = this.getDefaultValue();
    };
    inherits(EveRoomAirQuality, Characteristic);

    EveBatteryLevel = function () {
        Characteristic.call(this, 'Eve Battery Level', 'E863F11B-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
            format: Characteristic.Formats.UINT16,
            unit: "PERCENTAGE",
            maxValue: 100,
            minValue: 0,
            minStep: 1,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
        });
        this.value = this.getDefaultValue();
    };
    inherits(EveBatteryLevel, Characteristic);

    EveAirPressure = function () {
        //todo: only rough guess of extreme values -> use correct min/max if known
        Characteristic.call(this, 'Eve AirPressure', 'E863F10F-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
            format: Characteristic.Formats.UINT16,
            unit: "hPa",
            maxValue: 1085,
            minValue: 870,
            minStep: 1,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
        });
        this.value = this.getDefaultValue();
    };
    inherits(EveAirPressure, Characteristic);

    /////////////////////////////////////////////////////////////////////////////////////////////
    EveUnknownCharacteristicE863F112 = function () {
        Characteristic.call(this, 'EveUnknownCharacteristicE863F112', 'E863F112-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
            desc: '',
            perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE],
            format: Characteristic.Formats.DATA,
            value: hexToBase64('00000000')
        });
    };
    inherits(EveUnknownCharacteristicE863F112, Characteristic);

    EveUnknownCharacteristicE863F11E = function () {
        Characteristic.call(this, 'EveUnknownCharacteristicE863F11E', 'E863F11E-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
            desc: '',
            perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE],
            format: Characteristic.Formats.DATA,
            value: hexToBase64('01be00be 00f44fb8 0a000000')
        });
    };
    inherits(EveUnknownCharacteristicE863F11E, Characteristic);

    EveUnknownCharacteristicE863F116 = function () {
        Characteristic.call(this, 'EveUnknownCharacteristicE863F116', 'E863F116-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
            desc: 'Read Trunk 1',
            perms: [Characteristic.Perms.READ],
            format: Characteristic.Formats.DATA,
            value: hexToBase64('01010000 FF000000 3C0F0000 03010202 0203021D 00F50F00 00000000 000000')
        });
    };
    inherits(EveUnknownCharacteristicE863F116, Characteristic);

    EveUnknownCharacteristicE863F117 = function () {
        Characteristic.call(this, 'EveUnknownCharacteristicE863F117', 'E863F117-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
            desc: 'Read Trunk 2',
            perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE],
            format: Characteristic.Formats.DATA,
            value: null
        });
    };
    inherits(EveUnknownCharacteristicE863F117, Characteristic);

    EveUnknownCharacteristicE863F11C = function () {
        Characteristic.call(this, 'EveUnknownCharacteristicE863F11C', 'E863F11C-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
            desc: 'Write Trunk 1',
            perms: [Characteristic.Perms.WRITE],
            format: Characteristic.Formats.DATA,
            value: null
        });
    };
    inherits(EveUnknownCharacteristicE863F11C, Characteristic);

    EveUnknownCharacteristicE863F121 = function () {
        Characteristic.call(this, 'EveUnknownCharacteristicE863F121', 'E863F121-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
            desc: 'Write Trunk 2',
            perms: [Characteristic.Perms.WRITE],
            format: Characteristic.Formats.DATA,
            value: null
        });
    };
    inherits(EveUnknownCharacteristicE863F121, Characteristic);




    //Some kind of internal temp sensor? Returns 18.7 which is eq to first saved temp - temp low maybe?
    EveUnknownCharacteristicE863F111 = function () {
        Characteristic.call(this, 'EveUnknownCharacteristicE863F111', 'E863F111-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
            desc: 'Temp Min',
            perms: [Characteristic.Perms.READ],
            format: Characteristic.Formats.DATA,
            value: null
        });
    };
    inherits(EveUnknownCharacteristicE863F111, Characteristic);

    //Some kind of internal temp sensor? Returns 21.01 - temp max maybe?
    EveUnknownCharacteristicE863F124 = function () {
        Characteristic.call(this, 'EveUnknownCharacteristicE863F124', 'E863F124-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
            desc: 'Temp Max',
            perms: [Characteristic.Perms.READ],
            format: Characteristic.Formats.DATA,
            value: null
        });
    };
    inherits(EveUnknownCharacteristicE863F124, Characteristic);

    //Some kind of internal humidity sensor? Returns 48.75 which is well in range of hum - hum low maybe?
    EveUnknownCharacteristicE863F12A = function () {
        Characteristic.call(this, 'EveUnknownCharacteristicE863F12A', 'E863F12A-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
            desc: 'Hum Min',
            perms: [Characteristic.Perms.READ],
            format: Characteristic.Formats.DATA,
            value: null
        });
    };
    inherits(EveUnknownCharacteristicE863F12A, Characteristic);

    //Some kind of internal humidity sensor? Returns 85.22 which is well in range of hum - hum max maybe?
    EveUnknownCharacteristicE863F12B = function () {
        Characteristic.call(this, 'EveUnknownCharacteristicE863F12B', 'E863F12B-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
            desc: 'Hum Max',
            perms: [Characteristic.Perms.READ],
            format: Characteristic.Formats.DATA,
            value: null
        });
    };
    inherits(EveUnknownCharacteristicE863F12B, Characteristic);

    ////////////////////////////// Custom services //////////////////////////////
    PowerMeterService = function (displayName, subtype) {
        Service.call(this, displayName, '00000001-0000-1777-8000-775D67EC4377', subtype);
        // Required Characteristics
        this.addCharacteristic(EvePowerConsumption);
        // Optional Characteristics
        this.addOptionalCharacteristic(EveTotalPowerConsumption);
    };
    inherits(PowerMeterService, Service);

    //Eve service (custom UUID)
    EveRoomService = function (displayName, subtype) {
        Service.call(this, displayName, 'E863F002-079E-48FF-8F27-9C2605A29F52', subtype);
        // Required Characteristics
        this.addCharacteristic(EveRoomAirQuality);
        // Optional Characteristics
        this.addOptionalCharacteristic(Characteristic.CurrentRelativeHumidity);
    };
    inherits(EveRoomService, Service);

    /////////////////////////////////////////////////////////////////////////////////////////////
    //Eve service (custom UUID)
    EveWeatherService = function (displayName, subtype) {
        Service.call(this, displayName, 'E863F001-079E-48FF-8F27-9C2605A29F52', subtype);
        // Required Characteristics
        this.addCharacteristic(EveAirPressure);
        // Optional Characteristics
        this.addOptionalCharacteristic(Characteristic.CurrentRelativeHumidity);
        this.addOptionalCharacteristic(Characteristic.CurrentTemperature);
        this.addOptionalCharacteristic(EveBatteryLevel);

        this.addOptionalCharacteristic(EveUnknownCharacteristicE863F11E);
        this.addOptionalCharacteristic(EveUnknownCharacteristicE863F112);
    };
    inherits(EveWeatherService, Service);

    //Eve service (custom UUID)
    EveWeatherLogService = function (displayName, subtype) {
        Service.call(this, displayName, 'E863F007-079E-48FF-8F27-9C2605A29F52', subtype);
        // Required Characteristics
        // Optional Characteristics
        this.addOptionalCharacteristic(EveUnknownCharacteristicE863F116);
        this.addOptionalCharacteristic(EveUnknownCharacteristicE863F117);
        this.addOptionalCharacteristic(EveUnknownCharacteristicE863F11C);
        this.addOptionalCharacteristic(EveUnknownCharacteristicE863F121);
    };
    inherits(EveWeatherLogService, Service);
    /////////////////////////////////////////////////////////////////////////////////////////////

    homebridge.registerAccessory("homebridge-domotiga", "Domotiga", Domotiga);
}


Domotiga.prototype = {
    identify: function (callback) {
        this.log("Identify requested!");
        callback(); // success
    },
    domotigaGetValue: function (deviceValueNo, callback) {
        var that = this;
        JSONRequest('http://' + that.config.host + ':' + that.config.port,
                {
                    jsonrpc: "2.0",
                    method: "device.get",
                    params: { "device_id": that.config.device },
                    id: 1
                }, function (err, data) {
                    if (err) {
                        that.log("Sorry err: ", err);
                        callback(err);
                    }
                    else {
                        item = Number(deviceValueNo) - 1;
                        //that.log("data.result:", data.result);
                        //that.log( "data.result[values][0][value]", data.result[values][0][value]);
                        i = 0;
                        for (key1 in data.result) {
                            if (i == 37) {
                                //that.log("key1 ", i, key1, "values[key1]", values[key1]);
                                j = 0;
                                for (key2 in data.result[key1]) {
                                    if (j == item) {
                                        //that.log("key2 ", j, key2, "values[key1][key2]", values[key1][key2]);
                                        k = 0;
                                        for (key3 in data.result[key1][key2]) {
                                            if (k == 17) {
                                                //that.log("key3 ", k, key3, "data.result[key1][key2][key3]", data.result[key1][key2][key3]);
                                                callback(null, data.result[key1][key2][key3]);
                                            }
                                            ++k;
                                        }
                                    }
                                    ++j;
                                }
                            }
                            ++i;
                        }
                    }
                });
    },
    domotigaSetValue: function (deviceValueNo, value, callback) {
        var that = this;
        JSONRequest('http://' + that.config.host + ':' + that.config.port,
                {
                    jsonrpc: "2.0",
                    method: "device.set",
                    params: { "device_id": that.config.device, "valuenum": deviceValueNo, "value": value },
                    id: 1
                }, function (err, data) {
                    //that.log("data:", data);
                    if (err) {
                        that.log("Sorry err: ", err);
                        callback(err);
                    }
                    else {
                        callback();
                    }
                });
    },
    getCurrentRelativeHumidity: function (callback) {
        var that = this;
        that.log("getting CurrentRelativeHumidity for " + that.config.name);
        that.domotigaGetValue(that.config.valueHumidity, function (error, result) {
            if (error) {
                that.log('CurrentRelativeHumidity GetValue failed: %s', error.message);
                callback(error);
            } else {
                callback(null, Number(result));
            }
        }.bind(this));
    },
    getCurrentTemperature: function (callback) {
        var that = this;
        that.log("getting Temperature for " + that.config.name);
        that.domotigaGetValue(that.config.valueTemperature, function (error, result) {
            if (error) {
                that.log('CurrentTemperature GetValue failed: %s', error.message);
                callback(error);
            } else {
                callback(null, Number(result));
            }
        }.bind(this));
    },
    getTemperatureUnits: function (callback) {
        var that = this;
        that.log("getting Temperature unit for " + that.config.name);
        // 1 = F and 0 = C
        callback(null, 0);
    },
    getCurrentAirPressure: function (callback) {
        var that = this;
        that.log("getting CurrentAirPressure for " + that.config.name);
        that.domotigaGetValue(that.config.valueAirPressure, function (error, result) {
            if (error) {
                that.log('CurrentAirPressure GetValue failed: %s', error.message);
                callback(error);
            } else {
                callback(null, Number(result));
            }
        }.bind(this));
    },
    getContactState: function (callback) {
        var that = this;
        that.log("getting ContactState for " + that.config.name);
        that.domotigaGetValue(that.config.valueContact, function (error, result) {
            if (error) {
                that.log('getGetContactState GetValue failed: %s', error.message);
                callback(error);
            } else {
                if (result.toLowerCase() == "on")
                    callback(null, Characteristic.ContactSensorState.CONTACT_DETECTED);
                else
                    callback(null, Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
            }
        }.bind(this));
    },
    getLeakSensorState: function (callback) {
        var that = this;
        that.log("getting LeakSensorState for " + that.config.name);
        that.domotigaGetValue(that.config.valueLeakSensor, function (error, result) {
            if (error) {
                that.log('getLeakSensorState GetValue failed: %s', error.message);
                callback(error);
            } else {
                if (Number(result) == 0)
                    callback(null, Characteristic.LeakDetected.LEAK_NOT_DETECTED);
                else
                    callback(null, Characteristic.LeakDetected.LEAK_DETECTED);
            }
        }.bind(this));
    },
    getOutletState: function (callback) {
        var that = this;
        that.log("getting OutletState for " + that.config.name);
        that.domotigaGetValue(that.config.valueOutlet, function (error, result) {
            if (error) {
                that.log('getGetOutletState GetValue failed: %s', error.message);
                callback(error);
            } else {
                if (result.toLowerCase() == "on")
                    callback(null, 0);
                else
                    callback(null, 1);
            }
        }.bind(this));
    },
    setOutletState: function (boolvalue, callback) {
        var that = this;
        that.log("Setting outlet state for '%s' to %s", that.config.name, boolvalue);

        if (boolvalue == 1)
            outletState = "On";
        else
            outletState = "Off";

        var callbackWasCalled = false;
        that.domotigaSetValue(that.config.valueOutlet, outletState, function (err) {
            if (callbackWasCalled)
                that.log("WARNING: domotigaSetValue called its callback more than once! Discarding the second one.");

            callbackWasCalled = true;
            if (!err) {
                that.log("Successfully set outlet state on the '%s' to %s", that.config.name, outletState);
                callback(null);
            }
            else {
                that.log("Error setting outlet state to %s on the '%s'", outletState, that.config.name);
                callback(err);
            }
        }.bind(this));
    },
    getOutletInUse: function (callback) {
        var that = this;
        that.log("getting OutletInUse for " + that.config.name);
        that.domotigaGetValue(that.config.valueOutlet, function (error, result) {
            if (error) {
                that.log('getOutletInUse GetValue failed: %s', error.message);
                callback(error);
            } else {
                if (result.toLowerCase() == "on")
                    callback(null, false);
                else
                    callback(null, true);
            }
        }.bind(this));
    },
    getCurrentAirQuality: function (callback) {
        var that = this;
        that.log("getting airquality for " + that.config.name);

        that.domotigaGetValue(that.config.valueAirQuality, function (error, result) {
            if (error) {
                that.log('CurrentAirQuality GetValue failed: %s', error.message);
                callback(error);
            } else {
                voc = Number(result);
                that.log('CurrentAirQuality level: %s', voc);
                if (voc > 1500)
                    callback(null, Characteristic.AirQuality.POOR);
                else if (voc > 1000)
                    callback(null, Characteristic.AirQuality.INFERIOR);
                else if (voc > 800)
                    callback(null, Characteristic.AirQuality.FAIR);
                else if (voc > 600)
                    callback(null, Characteristic.AirQuality.GOOD);
                else if (voc > 0)
                    callback(null, Characteristic.AirQuality.EXCELLENT);
                else
                    callback(null, Characteristic.AirQuality.UNKNOWN);
            }
        }.bind(this));
    },
    // Eve characteristic (custom UUID)    
    getCurrentEveAirQuality: function (callback) {
        // Custom Eve intervals:
        //    0... 700 : Exzellent
        //  700...1100 : Good
        // 1100...1600 : Acceptable
        // 1600...2000 : Moderate
        //      > 2000 : Bad	
        var that = this;
        that.log("getting Eve room airquality for " + that.config.name);
        that.domotigaGetValue(that.config.valueAirQuality, function (error, result) {
            if (error) {
                that.log('CurrentEveAirQuality GetValue failed: %s', error.message);
                callback(error);
            } else {
                voc = Number(result);
                if (voc < 0)
                    voc = 0;
                callback(null, voc);
            }
        }.bind(this));
    },
    // Eve characteristic (custom UUID)    
    getEvePowerConsumption: function (callback) {
        var that = this;
        that.log("getting EvePowerConsumption for " + that.config.name);
        that.domotigaGetValue(that.config.valuePowerConsumption, function (error, result) {
            if (error) {
                that.log('PowerConsumption GetValue failed: %s', error.message);
                callback(error);
            } else {
                callback(null, Math.round(Number(result))); // W
            }
        }.bind(this));
    },
    // Eve characteristic (custom UUID)   
    getEveTotalPowerConsumption: function (callback) {
        var that = this;
        that.log("getting EveTotalPowerConsumption for " + that.config.name);
        that.domotigaGetValue(that.config.valueTotalPowerConsumption, function (error, result) {
            if (error) {
                that.log('EveTotalPowerConsumption GetValue failed: %s', error.message);
                callback(error);
            } else {
                callback(null, Math.round(Number(result) * 1000.0) / 1000.0); // kWh
            }
        }.bind(this));
    },
    getCurrentBatteryLevel: function (callback) {
        var that = this;
        that.log("getting Battery level for " + that.config.name);
        that.domotigaGetValue(that.config.valueBattery, function (error, result) {
            if (error) {
                that.log('CurrentBattery GetValue failed: %s', error.message);
                callback(error);
            } else {
                //that.log('CurrentBattery level Number(result): %s', Number(result));
                remaining = parseInt(Number(result) * 100 / 5000, 10);
                that.log('CurrentBattery level: %s', remaining);
                if (remaining > 100)
                    remaining = 100;
                else if (remaining < 0)
                    remaining = 0;
                callback(null, remaining);
            }
        }.bind(this));
    },
    getLowBatteryStatus: function (callback) {
        var that = this;
        that.log("getting BatteryStatus for " + that.config.name);
        that.domotigaGetValue(that.config.valueBattery, function (error, result) {
            if (error) {
                that.log('BatteryStatus GetValue failed: %s', error.message);
                callback(error);
            } else {
                var value = Number(result);
                if (isNaN(value) || value < Number(that.config.lowbattery))
                    callback(null, Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW);
                else
                    callback(null, Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
            }
        }.bind(this));
    },
    getMotionDetected: function (callback) {
        var that = this;
        that.log("getting MotionDetected for " + that.config.name);
        that.domotigaGetValue(that.config.valueMotionSensor, function (error, result) {
            if (error) {
                that.log('getMotionDetected GetValue failed: %s', error.message);
                callback(error);
            } else {
                if (Number(result) == 0)
                    callback(null, 0);
                else
                    callback(null, 1);
            }
        }.bind(this));
    },
    getSwitchOn: function (callback) {
        var that = this;
        that.log("getting SwitchState for " + that.config.name);
        that.domotigaGetValue(that.config.valueSwitch, function (error, result) {
            if (error) {
                that.log('getSwitchOn GetValue failed: %s', error.message);
                callback(error);
            } else {
                if (result.toLowerCase() == "on")
                    callback(null, 1);
                else
                    callback(null, 0);
            }
        }.bind(this));
    },
    setSwitchOn: function (switchOn, callback) {
        var that = this;
        that.log("Setting SwitchState for '%s' to %s", that.config.name, switchOn);

        if (switchOn == 1)
            switchState = "On";
        else
            switchState = "Off";

        var callbackWasCalled = false;
        that.domotigaSetValue(that.config.valueSwitch, switchState, function (err) {
            if (callbackWasCalled) {
                that.log("WARNING: domotigaSetValue called its callback more than once! Discarding the second one.");
            }
            callbackWasCalled = true;
            if (!err) {
                that.log("Successfully set switch state on the '%s' to %s", that.config.name, switchOn);
                callback(null);
            }
            else {
                that.log("Error setting switch state to %s on the '%s'", switchOn, that.config.name);
                callback(err);
            }
        }.bind(this));
    },


    /////////////////////////////////////////////////////////////////////////////////////////////
    getValueE863F11E: function (callback) {
        var that = this;
        that.log("getting value for EveUnknownCharacteristicE863F11E");

        var value = hexToBase64('01be00be 00f44fb8 0a000000');
        callback(null, value);
    },
    setValueE863F11E: function (value, callback) {
        var that = this;
        that.log('[%s] was written: %s', 'EveUnknownCharacteristicE863F11E', base64ToHex(value));
        callback(null, value);
    },
    getValueE863F112: function (callback) {
        var that = this;
        that.log("getting value for EveUnknownCharacteristicE863F112");
        var value = hexToBase64('00000000'); // always the same
        callback(null, value);
    },
    setValueE863F112: function (value, callback) {
        var that = this;
        that.log('[%s] was written: %s', 'EveUnknownCharacteristicE863F112', base64ToHex(value));
        callback(null, value);
    },
    getValueE863F116: function (callback) {
        var that = this;
        that.log("getting value for EveUnknownCharacteristicE863F116 (Read Trunk 1)");
        var value = hexToBase64('01010000 FF000000 3C0F0000 03010202 0203021D 00F50F00 00000000 000000');
        callback(null, value);
    },
    getValueE863F117: function (callback) {
        var that = this;
        that.log("getting value for EveUnknownCharacteristicE863F117 (Read Trunk 2)");

        /*
        timestamp:
        t0=0  = 02:00 o'clock
        600   = 02:10 (t0 + 600s)
        1200  = 02:20 (t0 + 1200s)
        1800  = 02:30 (t0 + 1800s)
        ...
        3600  = 03.00
        ...
        72000 = 22:00
        */

        var value = hexToBase64(
        '1500 0000 0000 0000 0080 0000 0000 0000 0000 0000 00' +
        new EveLogEntry(0x10, 1, 0, [1870, 7214, 9900]).toHex()
        + new EveLogEntry(0x10, 2, 600, [1810, 7214, 9901]).toHex()
        + new EveLogEntry(0x10, 3, 1200, [1820, 7214, 9902]).toHex()
        + new EveLogEntry(0x10, 4, 1800, [1830, 7214, 9903]).toHex()
        + new EveLogEntry(0x10, 5, 2400, [1840, 7214, 9904]).toHex()
        + new EveLogEntry(0x10, 6, 3000, [1850, 7214, 9905]).toHex()
        + new EveLogEntry(0x10, 7, 7200, [1860, 7214, 9906]).toHex()
        + new EveLogEntry(0x10, 8, 10800, [1870, 7214, 9907]).toHex()
        + new EveLogEntry(0x10, 9, 14400, [1880, 7214, 9908]).toHex()
        + new EveLogEntry(0x10, 10, 18000, [1890, 7214, 9909]).toHex()
        + new EveLogEntry(0x10, 11, 21600, [1900, 7214, 9910]).toHex()
        + new EveLogEntry(0x10, 12, 25200, [1910, 7214, 9911]).toHex()
        + new EveLogEntry(0x10, 13, 28800, [1920, 7214, 9912]).toHex()
        + new EveLogEntry(0x10, 14, 32400, [1930, 7214, 9913]).toHex()
        + new EveLogEntry(0x10, 15, 36000, [1870, 7214, 9914]).toHex()
        + new EveLogEntry(0x10, 16, 39600, [1870, 7214, 9915]).toHex()
        + new EveLogEntry(0x10, 17, 43200, [1870, 7214, 9916]).toHex()
        + new EveLogEntry(0x10, 18, 46800, [1870, 7214, 9917]).toHex()
        + new EveLogEntry(0x10, 19, 50400, [1870, 7214, 9918]).toHex()
        + new EveLogEntry(0x10, 20, 54000, [1870, 7214, 9919]).toHex()
        + new EveLogEntry(0x10, 21, 57600, [1870, 7214, 9920]).toHex()
        + new EveLogEntry(0x10, 22, 61200, [1870, 7214, 9921]).toHex()
        + new EveLogEntry(0x10, 23, 64800, [1870, 7214, 9922]).toHex()
        + new EveLogEntry(0x10, 24, 68400, [1870, 7214, 9923]).toHex()
        + new EveLogEntry(0x10, 25, 69000, [1870, 7214, 9924]).toHex()
        + new EveLogEntry(0x10, 26, 69600, [1870, 7214, 9925]).toHex()
        + new EveLogEntry(0x10, 27, 70200, [1870, 7214, 9926]).toHex()
        + new EveLogEntry(0x10, 28, 72000, [1870, 7214, 9927]).toHex()
        );
        callback(null, value);
    },
    setValueE863F117: function (value, callback) {
        var that = this;
        that.log('[%s] was written: %s', 'EveUnknownCharacteristicE863F117', base64ToHex(value));
        callback(null, value);
    },
    getValueE863F11C: function (callback) {
        var that = this;
        that.log("getting value for EveUnknownCharacteristicE863F11C");
        callback(null, null); //todo: return value
    },
    getValueE863F121: function (callback) {
        var that = this;
        that.log("getting value for EveUnknownCharacteristicE863F121");
        callback(null, null); //todo: return value
    },
    setValueE863F121: function (value, callback) {
        var that = this;
        that.log('[%s] was written: %s', 'EveUnknownCharacteristicE863F121', base64ToHex(value));
        callback(null, value);
    },
    //Temp low?
    getValueE863F111: function (callback) {
        var that = this;
        that.log("getting value for EveUnknownCharacteristicE863F111 Temp low");
        var value = hexToBase64('4e07'); // Returns 18.7
        callback(null, value);
    },
    //Temp high?
    getValueE863F124: function (callback) {
        var that = this;
        that.log("getting value for EveUnknownCharacteristicE863F124 Temp high");
        var value = hexToBase64('3508'); // Returns 21.01
        callback(null, value);
    },
    //Hum low?
    getValueE863F12A: function (callback) {
        var that = this;
        that.log("getting value for EveUnknownCharacteristicE863F12A Hum low");
        var value = hexToBase64('0b13'); // Returns 48.75
        callback(null, value);
    },
    //Hum high?
    getValueE863F12B: function (callback) {
        var that = this;
        that.log("getting value for EveUnknownCharacteristicE863F12B Hum high");
        var value = hexToBase64('4a21'); // Returns 85.22
        callback(null, value);
    },
    /////////////////////////////////////////////////////////////////////////////////////////////




    getServices: function () {
        // You can OPTIONALLY create an information service if you wish to override
        // the default values for things like serial number, model, etc.
        var informationService = new Service.AccessoryInformation();
        informationService
                .setCharacteristic(Characteristic.Manufacturer, 'Domotiga: ' + (this.config.manufacturer ? this.config.manufacturer : '<unknown>'))
                .setCharacteristic(Characteristic.Model, 'Domotiga: ' + (this.config.model ? this.config.model : '<unknown>'))
                .setCharacteristic(Characteristic.SerialNumber, ("Domotiga device " + this.config.device + this.config.name));

        var services = [informationService];

        // Create primary service
        var primaryservice;
        switch (this.config.service) {

            case "TemperatureSensor":
                primaryservice = new Service.TemperatureSensor(this.config.service);
                primaryservice.getCharacteristic(Characteristic.CurrentTemperature)
                        .on('get', this.getCurrentTemperature.bind(this));
                break;

            case "HumiditySensor":
                primaryservice = new Service.HumiditySensor(this.config.service);
                primaryservice.getCharacteristic(Characteristic.CurrentRelativeHumidity)
                        .on('get', this.getCurrentRelativeHumidity.bind(this));
                break;

            case "Contact":
                primaryservice = new Service.ContactSensor(this.config.service);
                primaryservice.getCharacteristic(Characteristic.ContactSensorState)
                        .on('get', this.getContactState.bind(this));
                break;

            case "LeakSensor":
                primaryservice = new Service.LeakSensor(this.config.service);
                primaryservice.getCharacteristic(Characteristic.LeakDetected)
                        .on('get', this.getLeakSensorState.bind(this));
                break;

            case "MotionSensor":
                primaryservice = new Service.MotionSensor(this.config.service);
                primaryservice.getCharacteristic(Characteristic.MotionDetected)
                        .on('get', this.getMotionDetected.bind(this));
                break;

            case "Switch":
                primaryservice = new Service.Switch(this.config.service);
                primaryservice.getCharacteristic(Characteristic.On)
                        .on('get', this.getSwitchOn.bind(this))
                        .on('set', this.setSwitchOn.bind(this));
                break;

            case "Outlet":
                primaryservice = new Service.Outlet(this.config.service);
                primaryservice.getCharacteristic(Characteristic.On)
                        .on('get', this.getOutletState.bind(this))
                        .on('set', this.setOutletState.bind(this));
                break;

            case "AirQualitySensor":
                primaryservice = new Service.AirQualitySensor(this.config.service);
                primaryservice.getCharacteristic(Characteristic.AirQuality)
                        .on('get', this.getCurrentAirQuality.bind(this));
                break;

            case "FakeEveAirQualitySensor":
                primaryservice = new EveRoomService("Eve Room");
                primaryservice.getCharacteristic(EveRoomAirQuality)
                        .on('get', this.getCurrentEveAirQuality.bind(this));
                break;

            case "FakeEveWeatherSensor":
                primaryservice = new EveWeatherService("Eve Weather");
                primaryservice.getCharacteristic(EveAirPressure)
                        .on('get', this.getCurrentAirPressure.bind(this));
                break;

            case "FakeEveWeatherSensorWithLog":
                primaryservice = new EveWeatherService("Eve Weather");
                primaryservice.getCharacteristic(EveAirPressure)
                        .on('get', this.getCurrentAirPressure.bind(this));
                break;

            case "Powermeter":
                primaryservice = new PowerMeterService(this.config.service);
                primaryservice.getCharacteristic(EvePowerConsumption)
                        .on('get', this.getEvePowerConsumption.bind(this));
                break;

            default:
                this.log('Service %s %s unknown, skipping...', this.config.service, this.config.name);
                break;
        }

        services = services.concat(primaryservice);
        if (services.length === 1) {
            this.log("WARN: Only the InformationService was successfully configured for " + this.config.name + "! No device services available!");
            return services;
        }

        // Everything outside the primary service gets added as optional characteristics...
        var service = services[1];

        if (this.config.valueTemperature && (this.config.service != "TemperatureSensor")) {
            service.addCharacteristic(Characteristic.CurrentTemperature)
                    .on('get', this.getCurrentTemperature.bind(this));
        }
        if (this.config.valueHumidity && (this.config.service != "HumiditySensor")) {
            service.addCharacteristic(Characteristic.CurrentRelativeHumidity)
                    .on('get', this.getCurrentRelativeHumidity.bind(this));
        }
        if (this.config.valueBattery) {
            service.addCharacteristic(Characteristic.BatteryLevel)
                    .on('get', this.getCurrentBatteryLevel.bind(this));
        }
        if (this.config.lowbattery) {
            service.addCharacteristic(Characteristic.StatusLowBattery)
                    .on('get', this.getLowBatteryStatus.bind(this));
        }
        // Additional required characteristic for outlet
        if (this.config.service == "Outlet") {
            service.getCharacteristic(Characteristic.OutletInUse)
                    .on('get', this.getOutletInUse.bind(this));
        }
        // Eve characteristic (custom UUID)
        if (this.config.valueAirPressure && 
        (this.config.service != "FakeEveWeatherSensor") && (this.config.service != "FakeEveWeatherSensorWithLog")) {
            service.addCharacteristic(EveAirPressure)
                    .on('get', this.getCurrentAirPressure.bind(this));
        }
        // Eve characteristic (custom UUID)
        if (this.config.valueAirQuality &&
            (this.config.service != "AirQualitySensor") && (this.config.service != "FakeEveAirQualitySensor")) {
            service.addCharacteristic(Characteristic.AirQuality)
                    .on('get', this.getCurrentEveAirQuality.bind(this));
        }
        // Eve characteristic (custom UUID)
        if (this.config.valuePowerConsumption && (this.config.service != "Powermeter")) {
            service.addCharacteristic(EvePowerConsumption)
                    .on('get', this.getEvePowerConsumption.bind(this));
        }
        // Eve characteristic (custom UUID)
        if (this.config.valueTotalPowerConsumption) {
            service.addCharacteristic(EveTotalPowerConsumption)
                    .on('get', this.getEveTotalPowerConsumption.bind(this));
        }
        
        // Playground
        if (this.config.service == "FakeEveWeatherSensorWithLog") {
            service.addCharacteristic(EveUnknownCharacteristicE863F11E)
                            .on('get', this.getValueE863F11E.bind(this))
                            .on('set', this.setValueE863F11E.bind(this));

            service.addCharacteristic(EveUnknownCharacteristicE863F112)
            .on('get', this.getValueE863F112.bind(this))
            .on('set', this.setValueE863F112.bind(this));

            //Temp low?
            service.addCharacteristic(EveUnknownCharacteristicE863F111)
            .on('get', this.getValueE863F111.bind(this));

            //Temp high?
            service.addCharacteristic(EveUnknownCharacteristicE863F124)
            .on('get', this.getValueE863F124.bind(this));

            //Hum low?
            service.addCharacteristic(EveUnknownCharacteristicE863F12A)
            .on('get', this.getValueE863F12A.bind(this));

            //Hum high?
            service.addCharacteristic(EveUnknownCharacteristicE863F12B)
            .on('get', this.getValueE863F12B.bind(this));

            var logService = new EveWeatherLogService("Eve Weather log service");
            //Eve characteristic (custom UUID)
            // read trunk 1
            logService
            .addCharacteristic(EveUnknownCharacteristicE863F116)
            .on('get', this.getValueE863F116.bind(this));

            // read trunk 2
            logService
            .addCharacteristic(EveUnknownCharacteristicE863F117)
            .on('get', this.getValueE863F117.bind(this))
            .on('set', this.setValueE863F117.bind(this));

            logService.addCharacteristic(EveUnknownCharacteristicE863F11C)
            .on('get', this.getValueE863F11C.bind(this));

            logService
            .addCharacteristic(EveUnknownCharacteristicE863F121)
            .on('get', this.getValueE863F121.bind(this))
            .on('set', this.setValueE863F121.bind(this));

            services = services.concat(logService);
        }
        return services;
    }
};
