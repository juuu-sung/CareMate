import { Text } from "react-native";

import { SectionCard } from "@/components/common/SectionCard";
import { SeniorScreen } from "@/components/common/SeniorScreen";

export default function ScheduleScreen() {
  return (
    <SeniorScreen title="일정 관리" subtitle="병원, 검사, 주민센터 방문 일정을 확인하는 화면입니다.">
      <SectionCard title="다가오는 일정" description="오늘과 내일 일정을 큰 글씨로 표시합니다.">
        <Text>오후 3시 주민센터 방문</Text>
      </SectionCard>
    </SeniorScreen>
  );
}
