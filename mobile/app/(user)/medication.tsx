import { Text } from "react-native";

import { SectionCard } from "@/components/common/SectionCard";
import { SeniorScreen } from "@/components/common/SeniorScreen";

export default function MedicationScreen() {
  return (
    <SeniorScreen title="복약 관리" subtitle="복약 시간, 알림 상태, 미응답 누적 여부를 보여주는 화면입니다.">
      <SectionCard title="다음 복약 알림" description="아침, 점심, 저녁 복약 스케줄을 노출합니다.">
        <Text>아침약 08:00</Text>
      </SectionCard>
    </SeniorScreen>
  );
}
