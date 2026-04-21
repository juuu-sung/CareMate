import { CareMode } from '@/types/care';
import { GuardianDashboard } from '@/types/guardian';

export type GuardianCareStatus = {
  label: string;
  color: string;
  backgroundColor: string;
  description: string;
};

export function formatGuardianCheckInStatus(
  status: GuardianDashboard['check_in_status']
) {
  switch (status) {
    case 'pending':
      return '응답 대기';
    case 'missed':
      return '확인 필요';
    case 'responded':
    default:
      return '응답 완료';
  }
}

export function formatGuardianCareMode(mode: CareMode) {
  if (mode === 'health_support') {
    return '건강 지원 모드';
  }
  if (mode === 'cognitive_support') {
    return '인지 지원 모드';
  }
  return '일상 돌봄 모드';
}

export function formatGuardianCareScore(score: number | null | undefined) {
  if (typeof score !== 'number' || Number.isNaN(score)) {
    return '-';
  }
  return `${score}점`;
}

export function getGuardianCareStatus(
  dashboard: GuardianDashboard | null,
  hasError: boolean
): GuardianCareStatus {
  if (hasError) {
    return {
      label: '오류',
      color: '#DC2626',
      backgroundColor: '#FEE2E2',
      description: '오늘 돌봄 점수 데이터를 다시 불러와 주세요.',
    };
  }

  if (!dashboard) {
    return {
      label: '확인중',
      color: '#6B7280',
      backgroundColor: '#F3F4F6',
      description: '최신 돌봄 신호를 확인하고 있어요.',
    };
  }

  if (dashboard.care_level === 'caution') {
    return {
      label: '주의',
      color: '#F97316',
      backgroundColor: '#FFF7ED',
      description: dashboard.care_summary,
    };
  }

  if (dashboard.care_level === 'check') {
    return {
      label: '확인 필요',
      color: '#CA8A04',
      backgroundColor: '#FEFCE8',
      description: dashboard.care_summary,
    };
  }

  return {
    label: '안정',
    color: '#05B547',
    backgroundColor: '#ECFDF3',
    description: dashboard.care_summary,
  };
}
