import { Text } from "react-native";

import { SectionCard } from "@/components/common/SectionCard";
import { SeniorScreen } from "@/components/common/SeniorScreen";

export default function ChatScreen() {
  return (
    <SeniorScreen title="대화하기" subtitle="버튼 기반 턴형 음성 대화 흐름을 위한 시작 화면입니다.">
      <SectionCard title="말하기 버튼" description="버튼을 누르면 음성을 녹음하고 STT 처리 후 응답을 생성합니다.">
        <Text>향후 STT, LLM, TTS 연결 예정</Text>
      </SectionCard>
      <SectionCard title="재확인 질문" description="인식이 불확실한 경우 다시 확인하는 흐름을 넣습니다.">
        <Text>예: 오늘 병원 가는 날이 맞으신가요?</Text>
      </SectionCard>
    </SeniorScreen>
  );
}
