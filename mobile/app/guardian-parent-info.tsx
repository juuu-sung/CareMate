import React, { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  View,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import {
  buildGuardianAuthSession,
  saveAuthSession,
} from '@/services/authSession';
import { updateParentCareInfoWithImages } from '@/services/parents';

type MealTiming = '식전' | '식간' | '식후';

type MedicationScheduleDraft = {
  id: string;
  name: string;
  easyName: string;
  mealTiming: MealTiming;
  timesPerDay: number;
  daysSupply: number;
};

const MEAL_TIMING_OPTIONS: MealTiming[] = ['식전', '식간', '식후'];
const EASY_MEDICATION_NAME_OPTIONS = [
  '혈압약',
  '당뇨약',
  '비염약',
  '감기약',
  '코감기약',
  '기침약',
  '알레르기약',
  '위장약',
  '소화제',
  '진통제',
  '항생제',
  '콜레스테롤약',
  '심장약',
  '수면약',
  '변비약',
  '기타약',
];

function createMedicationScheduleDraft(
  patch: Partial<Omit<MedicationScheduleDraft, 'id'>> = {}
): MedicationScheduleDraft {
  return {
    id: `med-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    easyName: '',
    mealTiming: '식후',
    timesPerDay: 1,
    daysSupply: 7,
    ...patch,
  };
}

function cleanMedicationName(value: string) {
  return String(value || '')
    .replace(/^\s*[-*.\d)]+/, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getMedicationSection(text: string, title: string) {
  const match = String(text || '').match(
    new RegExp(`\\[${title}\\]([\\s\\S]*?)(?=\\n\\s*\\[|$)`)
  );
  return match?.[1]?.trim() || '';
}

function parsePositiveNumber(value: string) {
  const match = String(value || '').match(/\d+/);
  if (!match) {
    return undefined;
  }

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseTimesPerDay(value: string) {
  const match = String(value || '').match(/(?:1\s*일|하루)?\s*(\d+)\s*회/);
  return match ? parsePositiveNumber(match[1]) : undefined;
}

function parseDaysSupply(value: string) {
  const match = String(value || '').match(/(\d+)\s*일\s*분?/);
  return match ? parsePositiveNumber(match[1]) : undefined;
}

function parseMealTiming(value: string): MealTiming | undefined {
  return MEAL_TIMING_OPTIONS.find((option) => value.includes(option));
}

function parseMedicationDraftFromLine(line: string) {
  const body = String(line || '').replace(/^\s*-\s*/, '').trim();
  if (!body) {
    return null;
  }

  if (body.includes('|')) {
    const fields = body.split('|').reduce<Record<string, string>>((acc, part) => {
      const [rawKey, ...rawValue] = part.split(':');
      if (!rawKey || rawValue.length === 0) {
        return acc;
      }
      acc[rawKey.trim()] = rawValue.join(':').trim();
      return acc;
    }, {});
    const name = cleanMedicationName(fields['약 이름'] || fields['약이름'] || '');
    if (!name) {
      return null;
    }

    return createMedicationScheduleDraft({
      name,
      easyName: cleanMedicationName(
        fields['쉬운 약 이름'] ||
          fields['쉬운이름'] ||
          fields['쉬운 이름'] ||
          fields['분류'] ||
          ''
      ),
      mealTiming: parseMealTiming(fields['복용 시점'] || '') || '식후',
      timesPerDay:
        parseTimesPerDay(
          fields['1일 복용 횟수'] || fields['복용 횟수'] || fields['횟수'] || ''
        ) ||
        parsePositiveNumber(
          fields['1일 복용 횟수'] || fields['복용 횟수'] || fields['횟수'] || ''
        ) ||
        1,
      daysSupply:
        parsePositiveNumber(fields['처방 일수'] || fields['일수'] || '') || 7,
    });
  }

  const separatorIndex = Math.max(body.indexOf(':'), body.indexOf('：'));
  const rawName = separatorIndex >= 0 ? body.slice(0, separatorIndex) : body;
  const note = separatorIndex >= 0 ? body.slice(separatorIndex + 1) : '';
  const name = cleanMedicationName(rawName);
  if (!name) {
    return null;
  }

  return createMedicationScheduleDraft({
    name,
    mealTiming: parseMealTiming(note) || '식후',
    timesPerDay: parseTimesPerDay(note) || 1,
    daysSupply: parseDaysSupply(note) || 7,
  });
}

function parseMedicationDraftsFromSummary(value: string) {
  const text = String(value || '').trim();
  if (!text) {
    return [createMedicationScheduleDraft()];
  }

  const candidateSections = [
    getMedicationSection(text, '복약 구조화'),
    getMedicationSection(text, '복용 중인 약'),
    getMedicationSection(text, '복약 안내'),
  ].filter(Boolean);

  const lines = candidateSections.length > 0
    ? candidateSections.flatMap((section) => section.split(/\n+/))
    : text.split(/[\n,;/]+/);

  const easyNameMap = extractEasyMedicationMapFromSummary(text);
  const drafts = lines
    .map(parseMedicationDraftFromLine)
    .map((entry) => {
      if (!entry) {
        return null;
      }

      return {
        ...entry,
        easyName: entry.easyName || findEasyMedicationName(entry.name, easyNameMap),
      };
    })
    .filter((entry): entry is MedicationScheduleDraft => !!entry);
  const seen = new Set<string>();
  const deduped = drafts.filter((entry) => {
    const key = entry.name.trim();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  return deduped.length > 0 ? deduped : [createMedicationScheduleDraft()];
}

function extractEasyMedicationMapFromSummary(value: string) {
  const section = getMedicationSection(value, '쉬운 약 이름');
  const result: Record<string, string> = {};

  section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-'))
    .forEach((line) => {
      const body = line.replace(/^\s*-\s*/, '').trim();
      const separatorIndex = Math.max(body.indexOf(':'), body.indexOf('：'));
      if (separatorIndex < 0) {
        return;
      }

      const officialName = cleanMedicationName(body.slice(0, separatorIndex));
      const easyName = cleanMedicationName(body.slice(separatorIndex + 1));

      if (officialName && easyName && !easyName.includes('확인 불가')) {
        result[officialName] = easyName;
      }
    });

  return result;
}

function medicationNameKey(value: string) {
  return String(value || '').replace(/\s+/g, '').toLowerCase();
}

function findEasyMedicationName(
  medicationName: string,
  easyNameMap: Record<string, string>
) {
  const targetKey = medicationNameKey(medicationName);
  if (!targetKey) {
    return '';
  }

  const matchedKey = Object.keys(easyNameMap).find((key) => {
    const keyValue = medicationNameKey(key);
    return keyValue === targetKey || keyValue.includes(targetKey) || targetKey.includes(keyValue);
  });

  return matchedKey ? easyNameMap[matchedKey] : '';
}

function medicationTextFromSummary(value: string) {
  return parseMedicationDraftsFromSummary(value)
    .map((entry) => entry.name.trim())
    .filter(Boolean)
    .join(', ');
}

export default function GuardianParentInfoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const parentId = String(params.parentId || '');
  const parentName = String(params.parentName || '부모님');
  const parentAge = String(params.parentAge || '');
  const parentGender = String(params.parentGender || '');
  const linkCode = String(params.linkCode || '');
  const guardianId = String(params.guardianId || params.guardian_id || '');
  const initialMedications = String(params.medications || '');

  const [medications, setMedications] = useState(() =>
    medicationTextFromSummary(initialMedications)
  );
  const [diseases, setDiseases] = useState(String(params.diseases || ''));
  const [allergies, setAllergies] = useState(String(params.allergies || ''));
  const [hospital, setHospital] = useState(String(params.hospital || ''));
  const [doctorContact, setDoctorContact] = useState(
    String(params.doctorContact || params.doctor_contact || '')
  );
  const [memo, setMemo] = useState(String(params.memo || ''));
  const [loading, setLoading] = useState(false);

  const [medicationImages, setMedicationImages] = useState<string[]>([]);
  const [medicationBagImages, setMedicationBagImages] = useState<string[]>([]);
  const [diseaseImages, setDiseaseImages] = useState<string[]>([]);
  const [allergyImages, setAllergyImages] = useState<string[]>([]);
  const [medicationEntries, setMedicationEntries] = useState<
    MedicationScheduleDraft[]
  >(() => parseMedicationDraftsFromSummary(initialMedications));

  const updateMedicationEntry = (
    id: string,
    patch: Partial<MedicationScheduleDraft>
  ) => {
    setMedicationEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
    );
  };

  const adjustMedicationEntryNumber = (
    id: string,
    field: 'timesPerDay' | 'daysSupply',
    delta: number
  ) => {
    setMedicationEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== id) {
          return entry;
        }

        const min = 1;
        const max = field === 'timesPerDay' ? 4 : 120;
        const nextValue = Math.min(max, Math.max(min, entry[field] + delta));

        return {
          ...entry,
          [field]: nextValue,
        };
      })
    );
  };

  const addMedicationEntry = () => {
    setMedicationEntries((prev) => [...prev, createMedicationScheduleDraft()]);
  };

  const removeMedicationEntry = (id: string) => {
    setMedicationEntries((prev) => {
      if (prev.length <= 1) {
        return prev.map((entry) =>
          entry.id === id ? { ...createMedicationScheduleDraft(), id } : entry
        );
      }

      return prev.filter((entry) => entry.id !== id);
    });
  };

  const pickImages = async (
    type: 'medication' | 'medicationBag' | 'disease' | 'allergy'
  ) => {
    if (loading) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('권한 필요', '사진을 올리려면 사진 접근 권한이 필요합니다.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (result.canceled) return;

    const selectedUris = result.assets.map((asset) => asset.uri);

    if (type === 'medication') {
      setMedicationImages((prev) => [...prev, ...selectedUris]);
    }

    if (type === 'medicationBag') {
      setMedicationBagImages((prev) => [...prev, ...selectedUris]);
    }

    if (type === 'disease') {
      setDiseaseImages((prev) => [...prev, ...selectedUris]);
    }

    if (type === 'allergy') {
      setAllergyImages((prev) => [...prev, ...selectedUris]);
    }
  };

  const removeImage = (
    type: 'medication' | 'medicationBag' | 'disease' | 'allergy',
    index: number
  ) => {
    if (loading) return;

    if (type === 'medication') {
      setMedicationImages((prev) => prev.filter((_, i) => i !== index));
    }

    if (type === 'medicationBag') {
      setMedicationBagImages((prev) => prev.filter((_, i) => i !== index));
    }

    if (type === 'disease') {
      setDiseaseImages((prev) => prev.filter((_, i) => i !== index));
    }

    if (type === 'allergy') {
      setAllergyImages((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const appendImagesToFormData = (
    formData: FormData,
    fieldName: string,
    uris: string[],
    prefix: string
  ) => {
    uris.forEach((uri, index) => {
      formData.append(fieldName, {
        uri,
        name: `${prefix}_${index + 1}.jpg`,
        type: 'image/jpeg',
      } as any);
    });
  };

  const handleComplete = async () => {
    if (loading) return;

    if (!parentId) {
      Alert.alert('오류', '부모님 정보가 올바르게 전달되지 않았습니다.');
      return;
    }

    try {
      setLoading(true);

      const formData = new FormData();

      formData.append('medications', medications.trim());
      formData.append('diseases', diseases.trim());
      formData.append('allergies', allergies.trim());
      formData.append('hospital', hospital.trim());
      formData.append('doctor_contact', doctorContact.trim());
      formData.append('memo', memo.trim());
      formData.append(
        'medication_entries_json',
        JSON.stringify(
          medicationEntries
            .map((entry) => ({
              name: entry.name.trim(),
              easyName: entry.easyName.trim(),
              mealTiming: entry.mealTiming,
              timesPerDay: entry.timesPerDay,
              daysSupply: entry.daysSupply,
            }))
            .filter((entry) => entry.name.length > 0)
        )
      );

      appendImagesToFormData(
        formData,
        'prescription_images',
        medicationImages,
        'prescription'
      );

      appendImagesToFormData(
        formData,
        'medication_bag_images',
        medicationBagImages,
        'medication_bag'
      );

      appendImagesToFormData(
        formData,
        'disease_document_images',
        diseaseImages,
        'disease_document'
      );

      appendImagesToFormData(
        formData,
        'allergy_document_images',
        allergyImages,
        'allergy_document'
      );

      const result = await updateParentCareInfoWithImages(parentId, formData);

      try {
        await saveAuthSession(
          buildGuardianAuthSession({
            guardianId,
            parentId,
            parentName,
            parentAge,
            parentGender,
            linkCode,
            medications: result.medications,
            diseases: result.diseases,
            allergies: result.allergies,
            hospital: result.hospital,
            doctorContact: result.doctor_contact,
            memo: result.memo,
          })
        );
      } catch (sessionError) {
        console.log('보호자 세션 저장 오류:', sessionError);
      }

      router.replace({
        pathname: '/guardian-home',
        params: {
          guardianId,
          parentId,
          parentName,
          parentAge,
          parentGender,
          linkCode,
          medications: result.medications,
          diseases: result.diseases,
          allergies: result.allergies,
          hospital: result.hospital,
          doctorContact: result.doctor_contact,
          memo: result.memo,
        },
      });
    } catch (error: any) {
      Alert.alert(
        '저장 실패',
        error.message || '부모님 건강정보 저장에 실패했습니다.'
      );
    } finally {
      setLoading(false);
    }
  };

  const ImageUploadSection = ({
    title,
    buttonText,
    images,
    type,
  }: {
    title: string;
    buttonText: string;
    images: string[];
    type: 'medication' | 'medicationBag' | 'disease' | 'allergy';
  }) => {
    return (
      <View style={styles.uploadSection}>
        <TouchableOpacity
          style={[styles.uploadButton, loading && styles.disabledButton]}
          onPress={() => pickImages(type)}
          activeOpacity={0.85}
          disabled={loading}
        >
          <Text style={styles.uploadPlus}>＋</Text>
          <View style={styles.uploadTextBox}>
            <Text style={styles.uploadButtonText}>{buttonText}</Text>
            <Text style={styles.uploadSubText}>여러 장 선택 가능</Text>
          </View>
        </TouchableOpacity>

        {images.length > 0 && (
          <View style={styles.previewContainer}>
            <Text style={styles.previewTitle}>
              {title} {images.length}장 선택됨
            </Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {images.map((uri, index) => (
                <View key={`${uri}-${index}`} style={styles.previewBox}>
                  <Image source={{ uri }} style={styles.previewImage} />

                  <TouchableOpacity
                    style={[
                      styles.deleteImageButton,
                      loading && styles.disabledButton,
                    ]}
                    onPress={() => removeImage(type, index)}
                    disabled={loading}
                  >
                    <Text style={styles.deleteImageText}>삭제</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  const NumberDial = ({
    label,
    value,
    suffix,
    onDecrease,
    onIncrease,
  }: {
    label: string;
    value: number;
    suffix: string;
    onDecrease: () => void;
    onIncrease: () => void;
  }) => {
    return (
      <View style={styles.numberDial}>
        <Text style={styles.numberDialLabel}>{label}</Text>
        <View style={styles.numberDialControl}>
          <TouchableOpacity
            style={styles.numberDialButton}
            onPress={onDecrease}
            activeOpacity={0.8}
          >
            <Text style={styles.numberDialButtonText}>-</Text>
          </TouchableOpacity>
          <Text style={styles.numberDialValue}>
            {value}
            {suffix}
          </Text>
          <TouchableOpacity
            style={styles.numberDialButton}
            onPress={onIncrease}
            activeOpacity={0.8}
          >
            <Text style={styles.numberDialButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const MedicationScheduleSection = () => {
    return (
      <View style={styles.medicationScheduleSection}>
        <View style={styles.medicationScheduleHeader}>
          <View style={styles.medicationScheduleTitleWrap}>
            <Text style={styles.medicationScheduleTitle}>복약 정보 확인</Text>
            <Text style={styles.medicationScheduleSubtitle}>
              사진에서 읽히지 않는 횟수와 일수는 여기서 조정하세요.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.addMedicationButton}
            onPress={addMedicationEntry}
            activeOpacity={0.85}
          >
            <Text style={styles.addMedicationButtonText}>약 추가</Text>
          </TouchableOpacity>
        </View>

        {medicationEntries.map((entry, index) => (
          <View key={entry.id} style={styles.medicationScheduleCard}>
            <View style={styles.medicationEntryHeader}>
              <Text style={styles.medicationEntryTitle}>약 {index + 1}</Text>
              <TouchableOpacity
                style={styles.removeMedicationButton}
                onPress={() => removeMedicationEntry(entry.id)}
                activeOpacity={0.85}
              >
                <Text style={styles.removeMedicationButtonText}>삭제</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.medicationNameInput}
              value={entry.name}
              onChangeText={(value) =>
                updateMedicationEntry(entry.id, { name: value })
              }
              placeholder="약 이름"
              placeholderTextColor="#9CA3AF"
            />

            <TextInput
              style={styles.medicationEasyNameInput}
              value={entry.easyName}
              onChangeText={(value) =>
                updateMedicationEntry(entry.id, { easyName: value })
              }
              placeholder="부모님 화면 이름 예: 혈압약"
              placeholderTextColor="#9CA3AF"
            />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.easyNameChipRow}
            >
              {EASY_MEDICATION_NAME_OPTIONS.map((option) => {
                const selected = entry.easyName.trim() === option;

                return (
                  <TouchableOpacity
                    key={`${entry.id}-${option}`}
                    style={[
                      styles.easyNameChip,
                      selected && styles.easyNameChipSelected,
                    ]}
                    onPress={() =>
                      updateMedicationEntry(entry.id, { easyName: option })
                    }
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.easyNameChipText,
                        selected && styles.easyNameChipTextSelected,
                      ]}
                    >
                      {option}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.mealTimingRow}>
              {MEAL_TIMING_OPTIONS.map((option) => {
                const selected = entry.mealTiming === option;

                return (
                  <TouchableOpacity
                    key={`${entry.id}-${option}`}
                    style={[
                      styles.mealTimingButton,
                      selected && styles.mealTimingButtonSelected,
                    ]}
                    onPress={() =>
                      updateMedicationEntry(entry.id, { mealTiming: option })
                    }
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.mealTimingButtonText,
                        selected && styles.mealTimingButtonTextSelected,
                      ]}
                    >
                      {option}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.numberDialRow}>
              <NumberDial
                label="1일"
                value={entry.timesPerDay}
                suffix="회"
                onDecrease={() =>
                  adjustMedicationEntryNumber(entry.id, 'timesPerDay', -1)
                }
                onIncrease={() =>
                  adjustMedicationEntryNumber(entry.id, 'timesPerDay', 1)
                }
              />
              <NumberDial
                label="처방"
                value={entry.daysSupply}
                suffix="일분"
                onDecrease={() =>
                  adjustMedicationEntryNumber(entry.id, 'daysSupply', -1)
                }
                onIncrease={() =>
                  adjustMedicationEntryNumber(entry.id, 'daysSupply', 1)
                }
              />
            </View>

            <Text style={styles.medicationEntryPreview}>
              {entry.mealTiming} / 1일 {entry.timesPerDay}회 / {entry.daysSupply}
              일분
            </Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!loading}
      >
        <Text style={styles.title}>부모님 정보 확인</Text>
        <Text style={styles.subtitle}>
          연동된 부모님 정보와 건강 정보를 확인하고 케어를 시작하세요.
        </Text>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>연동 코드</Text>
            <Text style={styles.infoValue}>{linkCode}</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>이름</Text>
            <Text style={styles.infoValue}>{parentName}</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>나이</Text>
            <Text style={styles.infoValue}>
              {parentAge ? `${parentAge}세` : '-'}
            </Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>성별</Text>
            <Text style={styles.infoValue}>{parentGender || '-'}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>건강 및 돌봄 정보 입력</Text>

        <Text style={styles.label}>복용 중인 약</Text>
        <TextInput
          style={styles.textArea}
          value={medications}
          onChangeText={setMedications}
          placeholder="예: 혈압약, 당뇨약"
          placeholderTextColor="#A0A0A0"
          multiline
          editable={!loading}
        />
        <View style={styles.medicationDocumentGroup}>
          <ImageUploadSection
            title="처방전"
            buttonText="처방전 사진 올리기"
            images={medicationImages}
            type="medication"
          />
          <ImageUploadSection
            title="약 봉투"
            buttonText="약 봉투 사진 올리기"
            images={medicationBagImages}
            type="medicationBag"
          />
        </View>
        <MedicationScheduleSection />

        <Text style={styles.label}>보유 질환</Text>
        <TextInput
          style={styles.textArea}
          value={diseases}
          onChangeText={setDiseases}
          placeholder="예: 고혈압, 당뇨"
          placeholderTextColor="#A0A0A0"
          multiline
          editable={!loading}
        />
        <ImageUploadSection
          title="진단서"
          buttonText="진단서 사진 올리기"
          images={diseaseImages}
          type="disease"
        />

        <Text style={styles.label}>알레르기 / 주의사항</Text>
        <TextInput
          style={styles.textArea}
          value={allergies}
          onChangeText={setAllergies}
          placeholder="예: 페니실린 알레르기, 낙상 주의"
          placeholderTextColor="#A0A0A0"
          multiline
          editable={!loading}
        />
        <ImageUploadSection
          title="알레르기 문서"
          buttonText="알레르기 관련 진단서 사진 올리기"
          images={allergyImages}
          type="allergy"
        />

        <Text style={styles.label}>주치의 / 자주 가는 병원</Text>
        <TextInput
          style={styles.input}
          value={hospital}
          onChangeText={setHospital}
          placeholder="예: 진주서울내과"
          placeholderTextColor="#A0A0A0"
          editable={!loading}
        />

        <Text style={styles.label}>비상 연락처</Text>
        <TextInput
          style={styles.input}
          value={doctorContact}
          onChangeText={setDoctorContact}
          placeholder="예: 055-123-4567"
          placeholderTextColor="#A0A0A0"
          keyboardType="phone-pad"
          editable={!loading}
        />

        <Text style={styles.label}>추가 메모</Text>
        <TextInput
          style={[styles.textArea, { height: 120 }]}
          value={memo}
          onChangeText={setMemo}
          placeholder="예: 매일 아침 8시 복약, 저녁 산책 선호"
          placeholderTextColor="#A0A0A0"
          multiline
          editable={!loading}
        />

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonLoading]}
          onPress={handleComplete}
          activeOpacity={0.85}
          disabled={loading}
        >
          {loading ? (
            <View style={styles.submitLoadingRow}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.submitLoadingText}>문서 요약 중...</Text>
            </View>
          ) : (
            <Text style={styles.submitText}>정보 저장 후 케어 시작하기</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          disabled={loading}
        >
          <Text style={[styles.backText, loading && styles.disabledText]}>
            이전으로
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="auto">
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#2563EB" />

            <Text style={styles.loadingTitle}>문서 요약 중...</Text>

            <Text style={styles.loadingSubtitle}>
              처방전과 건강 문서를 분석하고 있습니다.
            </Text>

            <Text style={styles.loadingNotice}>
              완료되면 자동으로 다음 화면으로 이동합니다.
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F1F1F1',
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
    backgroundColor: '#F1F1F1',
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: '#555',
  },
  infoCard: {
    marginTop: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 16,
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
  },
  sectionTitle: {
    marginTop: 24,
    marginBottom: 6,
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    height: 58,
    backgroundColor: '#E9E9EC',
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#111827',
  },
  textArea: {
    minHeight: 90,
    backgroundColor: '#E9E9EC',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    fontSize: 16,
    color: '#111827',
    textAlignVertical: 'top',
  },
  uploadSection: {
    marginTop: 10,
  },
  medicationDocumentGroup: {
    marginTop: 2,
    gap: 2,
  },
  uploadButton: {
    minHeight: 76,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#9CA3AF',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  uploadPlus: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#DBEAFE',
    color: '#2563EB',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 38,
    marginRight: 12,
  },
  uploadTextBox: {
    flex: 1,
  },
  uploadButtonText: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '800',
  },
  uploadSubText: {
    marginTop: 3,
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  previewContainer: {
    marginTop: 10,
  },
  previewTitle: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '700',
    marginBottom: 8,
  },
  previewBox: {
    width: 120,
    marginRight: 10,
  },
  previewImage: {
    width: 120,
    height: 120,
    borderRadius: 14,
    backgroundColor: '#E5E7EB',
  },
  deleteImageButton: {
    marginTop: 6,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteImageText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '800',
  },
  medicationScheduleSection: {
    marginTop: 14,
  },
  medicationScheduleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  medicationScheduleTitleWrap: {
    flex: 1,
    paddingRight: 10,
  },
  medicationScheduleTitle: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '800',
  },
  medicationScheduleSubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: '#6B7280',
    fontWeight: '600',
  },
  addMedicationButton: {
    borderRadius: 999,
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addMedicationButtonText: {
    fontSize: 13,
    color: '#1D4ED8',
    fontWeight: '800',
  },
  medicationScheduleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    marginBottom: 10,
  },
  medicationEntryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  medicationEntryTitle: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '800',
  },
  removeMedicationButton: {
    borderRadius: 999,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  removeMedicationButtonText: {
    fontSize: 12,
    color: '#B91C1C',
    fontWeight: '800',
  },
  medicationNameInput: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#111827',
    fontWeight: '700',
  },
  medicationEasyNameInput: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#065F46',
    fontWeight: '800',
    marginTop: 10,
  },
  easyNameChipRow: {
    gap: 8,
    paddingTop: 10,
    paddingRight: 8,
  },
  easyNameChip: {
    height: 36,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  easyNameChipSelected: {
    backgroundColor: '#DCFCE7',
    borderColor: '#22C55E',
  },
  easyNameChipText: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '800',
  },
  easyNameChipTextSelected: {
    color: '#166534',
  },
  mealTimingRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  mealTimingButton: {
    flex: 1,
    height: 42,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  mealTimingButtonSelected: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  mealTimingButtonText: {
    fontSize: 14,
    color: '#4B5563',
    fontWeight: '800',
  },
  mealTimingButtonTextSelected: {
    color: '#166534',
  },
  numberDialRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  numberDial: {
    flex: 1,
  },
  numberDialLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '800',
    marginBottom: 6,
  },
  numberDialControl: {
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  numberDialButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberDialButtonText: {
    fontSize: 18,
    color: '#0369A1',
    fontWeight: '900',
    lineHeight: 22,
  },
  numberDialValue: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '900',
  },
  medicationEntryPreview: {
    marginTop: 12,
    fontSize: 13,
    color: '#166534',
    fontWeight: '800',
  },
  submitButton: {
    marginTop: 28,
    height: 60,
    backgroundColor: '#05D34E',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButtonLoading: {
    opacity: 0.9,
  },
  submitLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitLoadingText: {
    marginLeft: 10,
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  submitText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  backButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  backText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.55,
  },
  disabledText: {
    color: '#A1A1AA',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 999,
    elevation: 999,
  },
  loadingBox: {
    width: '100%',
    maxWidth: 330,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  loadingTitle: {
    marginTop: 18,
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  loadingSubtitle: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '600',
  },
  loadingNotice: {
    marginTop: 16,
    fontSize: 13,
    lineHeight: 19,
    color: '#2563EB',
    textAlign: 'center',
    fontWeight: '700',
  },
});
