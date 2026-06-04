import React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const DEFAULT_ACCENT = '#2563EB';
const TEXT = '#111827';
const MUTED = '#64748B';
const BORDER = '#E2E8F0';
const SURFACE = '#FFFFFF';
const FIELD_BG = '#F8FAFC';

export function normalizeKoreanPhoneDigits(value: string) {
  let digits = String(value || '').replace(/\D/g, '');

  if (digits.startsWith('82') && digits.length >= 11) {
    digits = `0${digits.slice(2)}`;
  }

  return digits.slice(0, 11);
}

export function formatKoreanPhoneNumber(value: string) {
  const digits = normalizeKoreanPhoneDigits(value);

  if (!digits) {
    return '';
  }

  if (digits.startsWith('02')) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, digits.length - 4)}-${digits.slice(-4)}`;
  }

  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, digits.length - 4)}-${digits.slice(-4)}`;
}

export function isValidKoreanPhoneNumber(value: string) {
  const digits = normalizeKoreanPhoneDigits(value);
  return /^(01[016789]\d{7,8}|02\d{7,8}|0[3-6]\d{8,9})$/.test(digits);
}

export function PhoneNumberInput({
  label = '전화번호',
  value,
  onChangeText,
  required = false,
  accentColor = DEFAULT_ACCENT,
  helperText = '숫자만 입력해도 자동으로 정리돼요.',
  disabled = false,
}: {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  required?: boolean;
  accentColor?: string;
  helperText?: string;
  disabled?: boolean;
}) {
  const [focused, setFocused] = React.useState(false);
  const digits = normalizeKoreanPhoneDigits(value);
  const hasValue = digits.length > 0;
  const valid = isValidKoreanPhoneNumber(value);
  const showError = hasValue && digits.length >= 10 && !valid;
  const statusColor = valid ? '#047857' : showError ? '#DC2626' : MUTED;
  const statusIcon = valid
    ? 'checkmark-circle'
    : showError
      ? 'alert-circle'
      : 'information-circle-outline';
  const statusText = valid
    ? '입력 완료'
    : showError
      ? '전화번호를 다시 확인해 주세요.'
      : helperText;

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {required ? <Text style={[styles.required, { color: accentColor }]}>*</Text> : null}
      </View>

      <View
        style={[
          styles.inputShell,
          focused && { borderColor: accentColor, shadowColor: accentColor },
          showError && styles.inputShellError,
          disabled && styles.inputShellDisabled,
        ]}
      >
        <View style={[styles.countryBadge, { backgroundColor: `${accentColor}14` }]}>
          <Text style={[styles.countryText, { color: accentColor }]}>+82</Text>
        </View>

        <TextInput
          style={styles.input}
          value={value}
          onChangeText={(text) => onChangeText(formatKoreanPhoneNumber(text))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="010-1234-5678"
          placeholderTextColor="#94A3B8"
          keyboardType="number-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          maxLength={13}
          editable={!disabled}
        />

        {hasValue && !disabled ? (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => onChangeText('')}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="전화번호 지우기"
          >
            <Ionicons name="close-circle" size={22} color="#94A3B8" />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.statusRow}>
        <Ionicons name={statusIcon} size={16} color={statusColor} />
        <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 16,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '800',
    color: TEXT,
  },
  required: {
    fontSize: 16,
    fontWeight: '900',
  },
  inputShell: {
    minHeight: 66,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  inputShellError: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  inputShellDisabled: {
    opacity: 0.6,
  },
  countryBadge: {
    minHeight: 42,
    borderRadius: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countryText: {
    fontSize: 16,
    fontWeight: '900',
  },
  input: {
    flex: 1,
    minHeight: 62,
    paddingHorizontal: 12,
    fontSize: 21,
    lineHeight: 28,
    fontWeight: '800',
    color: TEXT,
    letterSpacing: 0,
  },
  clearButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FIELD_BG,
  },
  statusRow: {
    marginTop: 8,
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
});
