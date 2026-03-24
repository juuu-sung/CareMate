import { Link } from "expo-router";
import { Text } from "react-native";

import { SectionCard } from "@/components/common/SectionCard";
import { SeniorScreen } from "@/components/common/SeniorScreen";

export default function UserHomeScreen() {
  return (
    <SeniorScreen title="동행AI 홈" subtitle="자주 쓰는 기능을 크게 배치한 사용자 홈 화면입니다.">
      <SectionCard title="대화하기" description="버튼을 눌러 질문하고 음성으로 답변을 듣습니다.">
        <Link href="/(user)/chat">
          <Text>대화 화면으로 이동</Text>
        </Link>
      </SectionCard>
      <SectionCard title="복약 확인" description="다음 알림과 복약 일정을 확인합니다.">
        <Link href="/(user)/medication">
          <Text>복약 화면으로 이동</Text>
        </Link>
      </SectionCard>
      <SectionCard title="일정 보기" description="병원과 복지 관련 일정을 확인합니다.">
        <Link href="/(user)/schedule">
          <Text>일정 화면으로 이동</Text>
        </Link>
      </SectionCard>
      <SectionCard title="긴급 요청" description="도움이 필요할 때 SOS를 요청합니다.">
        <Link href="/(user)/sos">
          <Text>SOS 화면으로 이동</Text>
        </Link>
      </SectionCard>
    </SeniorScreen>
  );
}
