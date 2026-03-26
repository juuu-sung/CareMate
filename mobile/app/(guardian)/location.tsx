import { Text } from "react-native";

import { SectionCard } from "@/components/common/SectionCard";
import { SeniorScreen } from "@/components/common/SeniorScreen";

export default function GuardianLocationScreen() {
  return (
    <SeniorScreen
      title="위치 확인"
      subtitle="상시 수집된 최신 위치와 SOS 위치를 확인하는 화면입니다."
      backHref="/(guardian)/dashboard"
    >
      <SectionCard title="최신 위치" description="대상자의 마지막 위치와 갱신 시각을 표시합니다.">
        <Text>갱신 시각: 10:20</Text>
      </SectionCard>
    </SeniorScreen>
  );
}
