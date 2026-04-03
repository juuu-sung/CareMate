import React, { useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';

export default function HomeScreen() {
  const router = useRouter();
  const agentName = '동행이';

  const [isRecording, setIsRecording] = useState(false);

  const handleMicPress = () => {
    setIsRecording(!isRecording);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        
        {/* 헤더 */}
        <View style={styles.header}>
          <Text style={styles.title}>안녕하세요</Text>
          <Text style={styles.subtitle}>무엇을 도와드릴까요?</Text>
        </View>

        {/* 보호자 메시지 */}
        <View style={styles.messageCard}>
          <Text style={styles.messageTitle}>보호자 메시지</Text>
          <Text style={styles.messageText}>
            사랑하는 엄마, 오늘도 건강하게 좋은 하루 보내세요!
          </Text>
        </View>

        {/* 마이크 버튼 */}
        <View style={styles.micWrap}>
          <TouchableOpacity
            style={[
              styles.micButton,
              isRecording && styles.micActive,
            ]}
            onPress={handleMicPress}
          >
            <Text style={styles.micIcon}>🎤</Text>
            <Text style={styles.micText}>
              {isRecording ? '말씀하세요' : '눌러서 말하기'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 기능 버튼 */}
        <View style={styles.grid}>
          <TouchableOpacity style={styles.card} onPress={() => router.push('/chat')}>
            <Text style={styles.cardIcon}>💬</Text>
            <Text style={styles.cardText}>대화 보기</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card} onPress={() => router.push('/calendar')}>
            <Text style={styles.cardIcon}>📅</Text>
            <Text style={styles.cardText}>일정 보기</Text>
          </TouchableOpacity>
        </View>

        {/* SOS 버튼 */}
        <TouchableOpacity style={styles.sosButton}>
          <Text style={styles.sosText}>SOS 긴급 연락</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.callButton}>
          <Text style={styles.callText}>119 전화하기</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#EEF4FF',
  },
  container: {
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 20,
    color: '#64748B',
    marginTop: 6,
  },
  messageCard: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 20,
    marginBottom: 24,
  },
  messageTitle: {
    fontSize: 16,
    color: '#64748B',
    marginBottom: 6,
  },
  messageText: {
    fontSize: 18,
    color: '#0F172A',
  },
  micWrap: {
    alignItems: 'center',
    marginVertical: 20,
  },
  micButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#4F7CFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  micActive: {
    backgroundColor: '#7DA2FF',
  },
  micIcon: {
    fontSize: 60,
  },
  micText: {
    marginTop: 10,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  card: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
  },
  cardIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  cardText: {
    fontSize: 16,
    fontWeight: '600',
  },
  sosButton: {
    marginTop: 30,
    backgroundColor: '#FF8A8A',
    padding: 18,
    borderRadius: 20,
    alignItems: 'center',
  },
  sosText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  callButton: {
    marginTop: 12,
    backgroundColor: '#FFD9A8',
    padding: 16,
    borderRadius: 20,
    alignItems: 'center',
  },
  callText: {
    fontSize: 18,
    fontWeight: '700',
  },
});