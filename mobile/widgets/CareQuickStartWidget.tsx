import { HStack, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import { background, font, foregroundStyle, frame, padding, shapes } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export type CareQuickStartWidgetProps = {
  title: string;
  subtitle: string;
  shortLabel: string;
};

function CareQuickStartWidgetLayout(
  props: CareQuickStartWidgetProps,
  environment: WidgetEnvironment
) {
  'widget';

  if (environment.widgetFamily === 'accessoryCircular') {
    return (
      <ZStack
        modifiers={[
          frame({ width: 58, height: 58 }),
          background('#DBEAFE', shapes.circle()),
        ]}
      >
        <Text
          modifiers={[
            font({ size: 14, weight: 'bold', design: 'rounded' }),
            foregroundStyle('#0F172A'),
          ]}
        >
          케어
        </Text>
      </ZStack>
    );
  }

  if (environment.widgetFamily === 'accessoryRectangular') {
    return (
      <VStack
        spacing={4}
        modifiers={[
          padding({ horizontal: 10, vertical: 8 }),
          background('#EFF6FF', shapes.roundedRectangle({ cornerRadius: 14 })),
        ]}
      >
        <Text
          modifiers={[
            font({ size: 13, weight: 'bold', design: 'rounded' }),
            foregroundStyle('#1D4ED8'),
          ]}
        >
          {props.shortLabel}
        </Text>
        <Text
          modifiers={[
            font({ size: 11, weight: 'medium', design: 'rounded' }),
            foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
          ]}
        >
          눌러서 음성 대화 시작
        </Text>
      </VStack>
    );
  }

  return (
    <VStack
      spacing={10}
      modifiers={[
        frame({ width: 156, height: 156, alignment: 'leading' }),
        padding({ all: 16 }),
        background('#E0F2FE', shapes.roundedRectangle({ cornerRadius: 26 })),
      ]}
    >
      <HStack spacing={8}>
        <Text
          modifiers={[
            font({ size: 15, weight: 'bold', design: 'rounded' }),
            foregroundStyle('#0F172A'),
          ]}
        >
          {props.shortLabel}
        </Text>
      </HStack>

      <Text
        modifiers={[
          font({ size: 20, weight: 'bold', design: 'rounded' }),
          foregroundStyle('#0F172A'),
        ]}
      >
        {props.title}
      </Text>

      <Text
        modifiers={[
          font({ size: 13, weight: 'medium', design: 'rounded' }),
          foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
        ]}
      >
        {props.subtitle}
      </Text>
    </VStack>
  );
}

const careQuickStartWidget = createWidget<CareQuickStartWidgetProps>(
  'CareQuickStartWidget',
  CareQuickStartWidgetLayout
);

export default careQuickStartWidget;
