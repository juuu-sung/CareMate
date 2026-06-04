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

export function normalizeBirthDigits(value: string) {
  return String(value || '').replace(/\D/g, '').slice(0, 8);
}

export function formatBirthDate(value: string) {
  const digits = normalizeBirthDigits(value);

  if (digits.length <= 4) {
    return digits;
  }

  if (digits.length <= 6) {
    return `${digits.slice(0, 4)}.${digits.slice(4)}`;
  }

  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`;
}

export function isValidBirthDate(value: string) {
  const digits = normalizeBirthDigits(value);

  if (!/^\d{8}$/.test(digits)) {
    return false;
  }

  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const parsed = new Date(year, month - 1, day);
  const today = new Date();

  return (
    year >= 1900 &&
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day &&
    parsed.getTime() <= today.getTime()
  );
}

export function isUsableAddress(value: string) {
  return String(value || '').trim().length >= 5;
}

export function isValidPersonName(value: string) {
  return String(value || '').trim().length >= 2;
}

export function NameInput({
  label = '성명',
  value,
  onChangeText,
  required = false,
  accentColor = DEFAULT_ACCENT,
  helperText = '실제 이름을 입력해 주세요.',
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
  const trimmed = value.trim();
  const hasValue = trimmed.length > 0;
  const valid = isValidPersonName(value);
  const showError = hasValue && !valid;
  const statusColor = valid ? '#047857' : showError ? '#DC2626' : MUTED;
  const statusIcon = valid
    ? 'checkmark-circle'
    : showError
      ? 'alert-circle'
      : 'person-outline';
  const statusText = valid
    ? '입력 완료'
    : showError
      ? '이름을 두 글자 이상 입력해 주세요.'
      : helperText;

  return (
    <View style={styles.wrap}>
      <FieldLabel label={label} required={required} accentColor={accentColor} />

      <View
        style={[
          styles.inputShell,
          focused && { borderColor: accentColor, shadowColor: accentColor },
          showError && styles.inputShellError,
          disabled && styles.inputShellDisabled,
        ]}
      >
        <View style={[styles.iconBadge, { backgroundColor: `${accentColor}14` }]}>
          <Ionicons name="person-outline" size={22} color={accentColor} />
        </View>

        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="예: 김영희"
          placeholderTextColor="#94A3B8"
          textContentType="name"
          autoComplete="name"
          editable={!disabled}
        />

        {hasValue && !disabled ? (
          <ClearButton onPress={() => onChangeText('')} />
        ) : null}
      </View>

      <StatusRow icon={statusIcon} text={statusText} color={statusColor} />
    </View>
  );
}

export function GenderSelect({
  value,
  onChange,
  label = '성별',
  required = false,
  accentColor = DEFAULT_ACCENT,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  accentColor?: string;
  disabled?: boolean;
}) {
  const selected = value === '남성' || value === '여성';
  const statusColor = selected ? '#047857' : MUTED;

  return (
    <View style={styles.wrap}>
      <FieldLabel label={label} required={required} accentColor={accentColor} />

      <View style={styles.optionRow}>
        {[
          { label: '남성', icon: 'male-outline' as const },
          { label: '여성', icon: 'female-outline' as const },
        ].map((option) => {
          const isSelected = value === option.label;

          return (
            <TouchableOpacity
              key={option.label}
              style={[
                styles.optionButton,
                isSelected && {
                  backgroundColor: `${accentColor}16`,
                  borderColor: accentColor,
                },
                disabled && styles.inputShellDisabled,
              ]}
              onPress={() => onChange(option.label)}
              activeOpacity={0.82}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`${option.label} 선택`}
            >
              <View
                style={[
                  styles.optionIcon,
                  { backgroundColor: isSelected ? accentColor : FIELD_BG },
                ]}
              >
                <Ionicons
                  name={option.icon}
                  size={22}
                  color={isSelected ? '#FFFFFF' : MUTED}
                />
              </View>
              <Text
                style={[
                  styles.optionText,
                  isSelected && { color: accentColor },
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <StatusRow
        icon={selected ? 'checkmark-circle' : 'male-female-outline'}
        text={selected ? '선택 완료' : '성별을 선택해 주세요.'}
        color={statusColor}
      />
    </View>
  );
}

export function BirthDateInput({
  label = '생년월일',
  value,
  onChangeText,
  required = false,
  accentColor = DEFAULT_ACCENT,
  helperText = '숫자 8자리를 입력하면 자동으로 정리돼요.',
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
  const digits = normalizeBirthDigits(value);
  const hasValue = digits.length > 0;
  const valid = isValidBirthDate(value);
  const showError = digits.length === 8 && !valid;
  const statusColor = valid ? '#047857' : showError ? '#DC2626' : MUTED;
  const statusIcon = valid
    ? 'checkmark-circle'
    : showError
      ? 'alert-circle'
      : 'calendar-outline';
  const statusText = valid
    ? '입력 완료'
    : showError
      ? '생년월일을 다시 확인해 주세요.'
      : helperText;

  return (
    <View style={styles.wrap}>
      <FieldLabel label={label} required={required} accentColor={accentColor} />

      <View
        style={[
          styles.inputShell,
          focused && { borderColor: accentColor, shadowColor: accentColor },
          showError && styles.inputShellError,
          disabled && styles.inputShellDisabled,
        ]}
      >
        <View style={[styles.iconBadge, { backgroundColor: `${accentColor}14` }]}>
          <Ionicons name="calendar-clear-outline" size={21} color={accentColor} />
        </View>

        <TextInput
          style={styles.input}
          value={value}
          onChangeText={(text) => onChangeText(formatBirthDate(text))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="1947.03.12"
          placeholderTextColor="#94A3B8"
          keyboardType="number-pad"
          textContentType="birthdate"
          maxLength={10}
          editable={!disabled}
        />

        {hasValue && !disabled ? (
          <ClearButton onPress={() => onChangeText('')} />
        ) : null}
      </View>

      <StatusRow icon={statusIcon} text={statusText} color={statusColor} />
    </View>
  );
}

export function AddressInput({
  label = '주소',
  value,
  onChangeText,
  required = false,
  accentColor = DEFAULT_ACCENT,
  helperText = '도로명, 건물명, 동까지 입력해 주세요.',
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
  const trimmed = value.trim();
  const hasValue = trimmed.length > 0;
  const valid = isUsableAddress(value);
  const showError = hasValue && !valid;
  const statusColor = valid ? '#047857' : showError ? '#DC2626' : MUTED;
  const statusIcon = valid
    ? 'checkmark-circle'
    : showError
      ? 'alert-circle'
      : 'location-outline';
  const statusText = valid
    ? '주소 입력 완료'
    : showError
      ? '주소를 조금 더 자세히 입력해 주세요.'
      : helperText;

  return (
    <View style={styles.wrap}>
      <FieldLabel label={label} required={required} accentColor={accentColor} />

      <View
        style={[
          styles.addressShell,
          focused && { borderColor: accentColor, shadowColor: accentColor },
          showError && styles.inputShellError,
          disabled && styles.inputShellDisabled,
        ]}
      >
        <View style={[styles.iconBadge, { backgroundColor: `${accentColor}14` }]}>
          <Ionicons name="location-outline" size={22} color={accentColor} />
        </View>

        <TextInput
          style={styles.addressInput}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="예: 경남 진주시 진주대로 501"
          placeholderTextColor="#94A3B8"
          textContentType="fullStreetAddress"
          autoComplete="street-address"
          multiline
          editable={!disabled}
        />

        {hasValue && !disabled ? (
          <ClearButton onPress={() => onChangeText('')} />
        ) : null}
      </View>

      <StatusRow icon={statusIcon} text={statusText} color={statusColor} />
    </View>
  );
}

function FieldLabel({
  label,
  required,
  accentColor,
}: {
  label: string;
  required: boolean;
  accentColor: string;
}) {
  return (
    <View style={styles.labelRow}>
      <Text style={styles.label}>{label}</Text>
      {required ? <Text style={[styles.required, { color: accentColor }]}>*</Text> : null}
    </View>
  );
}

function ClearButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.clearButton}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel="입력 지우기"
    >
      <Ionicons name="close-circle" size={22} color="#94A3B8" />
    </TouchableOpacity>
  );
}

function StatusRow({
  icon,
  text,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  color: string;
}) {
  return (
    <View style={styles.statusRow}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.statusText, { color }]}>{text}</Text>
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
  addressShell: {
    minHeight: 78,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
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
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
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
  addressInput: {
    flex: 1,
    minHeight: 60,
    paddingHorizontal: 12,
    paddingTop: 7,
    paddingBottom: 7,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700',
    color: TEXT,
    letterSpacing: 0,
    textAlignVertical: 'top',
  },
  clearButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FIELD_BG,
    marginTop: 3,
  },
  optionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  optionButton: {
    flex: 1,
    minHeight: 72,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  optionIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
    fontSize: 19,
    lineHeight: 26,
    fontWeight: '900',
    color: TEXT,
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
