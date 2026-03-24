import { Text } from "react-native";

import { SectionCard } from "@/components/common/SectionCard";
import { SeniorScreen } from "@/components/common/SeniorScreen";

export default function UserSettingsScreen() {
  return (
    <SeniorScreen title="설정" subtitle="사용자 앱에서 접근 가능한 기본 설정 화면입니다.">
      <SectionCard title="음성 설정" description="글자 크기와 음성 재생 기본값을 조절합니다.">
        <Text>향후 접근성 옵션 추가 예정</Text>
      </SectionCard>
    </SeniorScreen>
  );
}
