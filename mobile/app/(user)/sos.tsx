import { Text } from "react-native";

import { SectionCard } from "@/components/common/SectionCard";
import { SeniorScreen } from "@/components/common/SeniorScreen";

export default function SosScreen() {
  return (
    <SeniorScreen
      title="SOS 요청"
      subtitle="긴급 상황에서 보호자에게 알리고 최신 위치를 전달하는 화면입니다."
      backHref="/(user)/home"
    >
      <SectionCard title="긴급 요청 버튼" description="누르는 즉시 보호자 알림과 위치 전송을 수행합니다.">
        <Text>향후 실제 요청 버튼 연결 예정</Text>
      </SectionCard>
    </SeniorScreen>
  );
}
