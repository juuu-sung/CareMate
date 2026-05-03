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

export default function GuardianParentInfoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const parentId = String(params.parentId || '');
  const parentName = String(params.parentName || '부모님');
  const parentAge = String(params.parentAge || '');
  const parentGender = String(params.parentGender || '');
  const linkCode = String(params.linkCode || '');

  const [medications, setMedications] = useState('');
  const [diseases, setDiseases] = useState('');
  const [allergies, setAllergies] = useState('');
  const [hospital, setHospital] = useState('');
  const [doctorContact, setDoctorContact] = useState('');
  const [memo, setMemo] = useState('');
  const [loading, setLoading] = useState(false);

  const [medicationImages, setMedicationImages] = useState<string[]>([]);
  const [diseaseImages, setDiseaseImages] = useState<string[]>([]);
  const [allergyImages, setAllergyImages] = useState<string[]>([]);

  const pickImages = async (type: 'medication' | 'disease' | 'allergy') => {
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

    if (type === 'disease') {
      setDiseaseImages((prev) => [...prev, ...selectedUris]);
    }

    if (type === 'allergy') {
      setAllergyImages((prev) => [...prev, ...selectedUris]);
    }
  };

  const removeImage = (
    type: 'medication' | 'disease' | 'allergy',
    index: number
  ) => {
    if (loading) return;

    if (type === 'medication') {
      setMedicationImages((prev) => prev.filter((_, i) => i !== index));
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

      appendImagesToFormData(
        formData,
        'prescription_images',
        medicationImages,
        'prescription'
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
    type: 'medication' | 'disease' | 'allergy';
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
        <ImageUploadSection
          title="처방전"
          buttonText="처방전 사진 올리기"
          images={medicationImages}
          type="medication"
        />

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