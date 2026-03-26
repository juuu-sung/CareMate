import { Text } from "react-native";

import { SectionCard } from "@/components/common/SectionCard";
import { SeniorScreen } from "@/components/common/SeniorScreen";

export default function GuardianProfileScreen() {
  return (
    <SeniorScreen
      title="보호자 프로필"
      subtitle="보호자 연락처와 연결 대상자 정보를 확인하는 화면입니다."
      backHref="/(guardian)/dashboard"
    >
      <SectionCard title="연결 정보" description="보호자와 대상자 간 연결 상태를 보여줍니다.">
        <Text>향후 사용자 연결 관리 기능 추가 예정</Text>
      </SectionCard>
    </SeniorScreen>
  );
}
