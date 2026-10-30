import type {
  BleDeviceInfo,
  ConnectionContext,
  ScaleAdapterCore,
  GattWiring,
  ScaleReading,
  UserProfile,
  BodyComposition,
} from '../interfaces/scale-adapter.js';
import { uuid16, buildPayload, xorChecksum, type ScaleBodyComp } from './body-comp-helpers.js';
import { matchesDescriptor, type MatchDescriptor } from './match-descriptor.js';

const SVC_UUID = uuid16(0xfff0);
const CHR_NOTIFY = uuid16(0xfff4);
const CHR_WRITE = uuid16(0xfff1);

/**
 * Adapter for the Hume Body 2 scale.
 */
export class HumeBodyPodAdapter implements ScaleAdapterCore,GattWiring {
  readonly name = 'Hume Body Pod 2';
  readonly match: MatchDescriptor = {
    priority: 10,
    custom: true,
    names: { includes: ['hume'] },
    serviceUuids: ['fff0'],
    charUuids: ['fff2'],
  };
  readonly charNotifyUuid = CHR_NOTIFY;
  readonly charWriteUuid =  CHR_WRITE;
  readonly normalizesWeight = true;

  matches(device: BleDeviceInfo): boolean {
    return matchesDescriptor(device, this.match);
  }

  /**
   * CMD_SEND_USER with real profile: [0xFE, 0x01, 0x03, gender, age, height, xor].
   */
  async onConnected(ctx: ConnectionContext): Promise<void> {
    const { profile } = ctx;
    const gender = profile.gender === 'male' ? 0x00 : 0x01;
    const height = Math.min(0xff, Math.max(0, Math.round(profile.height)));
    const age = Math.min(0xff, Math.max(0, profile.age));
    const cmd = [0xfe, 0x01, gender, 0, height, age];
    cmd.push(xorChecksum(cmd, 0, cmd.length));
    await ctx.write(this.charWriteUuid, cmd, false);
  }

  parseNotification(data: Buffer): ScaleReading | null {
    let weight = NaN;
    let impedance = NaN;
    //Weight data
    if(data[0] == 0xcf && data.length >= 5){
        weight = data.readUInt16LE(3)/100;
    }
    // //Body Composition Impedance
    // if(data[0] == 0xbe && data.length >= 12){
    // }
    // //Body Extension Data
    // if(data[0] == 0xdf){
        
    // }

    // // Check for BIA contact and body composition data
    // if (data.length >= 19 && data[5] === 0x00) {
    //   this.cachedFat = data.readUInt16LE(6) / 10;
    //   this.cachedWater = data.readUInt16LE(8) / 10;
    //   this.cachedMuscle = data.readUInt16LE(10) / 10;
    //   this.cachedBone = data[14] / 10;
    //   this.cachedVisceral = data.readUInt16LE(17) / 10;
    // }
    return { weight, impedance: 0 };
  }

  isComplete(reading: ScaleReading): boolean {
    return reading.weight > 0;
  }

  computeMetrics(reading: ScaleReading, profile: UserProfile): BodyComposition {
    const comp: ScaleBodyComp = {
      fat: undefined,
      water: undefined,
      muscle: undefined,
      bone: undefined,
      visceralFat: undefined,
    };
    return buildPayload(reading.weight, reading.impedance, comp, profile);
  }
}
