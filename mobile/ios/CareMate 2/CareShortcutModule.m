#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

static NSString * const CareShortcutPendingActionKey = @"CareShortcutPendingAction";

@interface CareShortcutModule : NSObject <RCTBridgeModule>
@end

@implementation CareShortcutModule

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

RCT_REMAP_METHOD(getPendingLaunchAction,
                 getPendingLaunchActionWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
  NSString *action = [defaults stringForKey:CareShortcutPendingActionKey];

  if (action != nil) {
    [defaults removeObjectForKey:CareShortcutPendingActionKey];
    [defaults synchronize];
  }

  resolve(action ?: (id)kCFNull);
}

@end
