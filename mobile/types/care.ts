export type CareMode = "basic" | "cognitive_support" | "health_support";

export type GuardianOptions = {
  checkInIntervalMinutes: number;
  alertRepeatCount: number;
  alwaysOnLocationEnabled: boolean;
};
