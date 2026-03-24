import { Text } from "react-native";

import { SectionCard } from "@/components/common/SectionCard";
import { SeniorScreen } from "@/components/common/SeniorScreen";

export default function AlertsScreen() {
  return (
    <SeniorScreen title="알림 이력" subtitle="규칙 기반 이상 징후와 보호자 전송 이력을 보여주는 화면입니다.">
      <SectionCard title="최근 이상 징후" description="체크인 미응답, 복약 미확인 같은 이벤트를 시간순으로 표시합니다.">
        <Text>09:30 복약 알림 3회 미응답</Text>
      </SectionCard>
    </SeniorScreen>
  );
}
