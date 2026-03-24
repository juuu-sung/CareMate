import { Text } from "react-native";

import { SectionCard } from "@/components/common/SectionCard";
import { SeniorScreen } from "@/components/common/SeniorScreen";

export default function ModesScreen() {
  return (
    <SeniorScreen title="돌봄 모드 설정" subtitle="기본, 인지 지원, 건강 관리 모드와 세부 옵션을 제어하는 화면입니다.">
      <SectionCard title="현재 모드" description="대상자에게 적용 중인 모드를 표시합니다.">
        <Text>기본 모드</Text>
      </SectionCard>
      <SectionCard title="세부 옵션" description="체크인 주기, 위치 공유, 반복 알림 횟수를 조절합니다.">
        <Text>향후 실제 설정 폼 연결 예정</Text>
      </SectionCard>
    </SeniorScreen>
  );
}
