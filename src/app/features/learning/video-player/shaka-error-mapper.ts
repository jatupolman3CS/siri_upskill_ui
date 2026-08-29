export interface PlaybackErrorInfo {
  readonly title: string;
  readonly message: string;
  readonly isRecoverable: boolean;
}

/**
 * Maps Shaka Player error codes and native HTML5 media errors to user-friendly, localized error messages.
 */
export function mapShakaPlaybackError(error: unknown): PlaybackErrorInfo {
  if (!error) {
    return {
      title: 'เกิดข้อผิดพลาดในการเล่นวิดีโอ',
      message: 'กรุณาลองใหม่อีกครั้ง หรือรีเฟรชหน้าจอ',
      isRecoverable: true,
    };
  }

  const errObj = error as {
    category?: number;
    code?: number;
    severity?: number;
    message?: string;
  };

  const category = errObj.category;
  const code = errObj.code;

  // Shaka Category 6: DRM
  if (category === 6) {
    if (code === 6007 || code === 6008) {
      return {
        title: 'สิทธิ์การรับชมหมดอายุหรือไม่ถูกต้อง',
        message: 'เซสชันการรับชมหมดอายุ หรือไม่สามารถยืนยันสิทธิ์ DRM ได้ กรุณารีเฟรชเพื่อขอสิทธิ์ใหม่',
        isRecoverable: true,
      };
    }
    return {
      title: 'ข้อผิดพลาดการตรวจสอบสิทธิ์วิดีโอ (DRM)',
      message: 'ไม่สามารถตรวจสอบสิทธิ์การเข้ารหัสวิดีโอได้ กรุณาตรวจสอบว่าเบราว์เซอร์รองรับ DRM หรือลองใหม่อีกครั้ง',
      isRecoverable: true,
    };
  }

  // Shaka Category 1: Network
  if (category === 1) {
    if (code === 1002) {
      return {
        title: 'เซิร์ฟเวอร์วิดีโอไม่ตอบสนอง',
        message: 'เซิร์ฟเวอร์วิดีโอขัดข้องชั่วคราว (HTTP error) กรุณาลองใหม่อีกครั้ง',
        isRecoverable: true,
      };
    }
    return {
      title: 'ปัญหาการเชื่อมต่ออินเทอร์เน็ต',
      message: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์สตรีมมิ่งได้ กรุณาตรวจสอบสัญญาณอินเทอร์เน็ตของคุณ',
      isRecoverable: true,
    };
  }

  // Shaka Category 3: Media
  if (category === 3) {
    return {
      title: 'เกิดข้อผิดพลาดในการถอดรหัสวิดีโอ',
      message: 'เบราว์เซอร์ไม่สามารถถอดรหัสชิ้นส่วนวิดีโอนี้ได้ กรุณาลองเปลี่ยนคุณภาพหรือรีเฟรชหน้าเว็บ',
      isRecoverable: true,
    };
  }

  // Shaka Category 4: Manifest
  if (category === 4) {
    return {
      title: 'ไม่สามารถโหลดโครงสร้างวิดีโอได้',
      message: 'ไม่สามารถประมวลผลไฟล์สตรีมมิ่ง (HLS/DASH manifest) ได้ กรุณาลองใหม่อีกครั้ง',
      isRecoverable: true,
    };
  }

  // Shaka Category 5: Streaming
  if (category === 5) {
    return {
      title: 'การสตรีมวิดีโอขัดข้อง',
      message: 'การส่งข้อมูลวิดีโอสะดุด กรุณากดปุ่มลองใหม่อีกครั้ง',
      isRecoverable: true,
    };
  }

  // Native HTMLMediaElement MediaError
  if (error instanceof Event && (error.target as HTMLMediaElement)?.error) {
    const mediaErr = (error.target as HTMLMediaElement).error;
    if (mediaErr) {
      switch (mediaErr.code) {
        case 1: // MEDIA_ERR_ABORTED
          return {
            title: 'การเล่นวิดีโอถูกยกเลิก',
            message: 'การโหลดวิดีโอถูกยกเลิกโดยผู้ใช้หรือเบราว์เซอร์',
            isRecoverable: true,
          };
        case 2: // MEDIA_ERR_NETWORK
          return {
            title: 'เกิดข้อผิดพลาดเครือข่าย',
            message: 'การดาวน์โหลดวิดีโอขัดข้องจากปัญหาเครือข่าย',
            isRecoverable: true,
          };
        case 3: // MEDIA_ERR_DECODE
          return {
            title: 'การถอดรหัสล้มเหลว',
            message: 'ไฟล์วิดีโอเสียหายหรือไม่สามารถถอดรหัสบนอุปกรณ์นี้ได้',
            isRecoverable: false,
          };
        case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
          return {
            title: 'ไม่รองรับรูปแบบวิดีโอนี้',
            message: 'เบราว์เซอร์ของคุณไม่รองรับรูปแบบการเข้ารหัสวิดีโอนี้',
            isRecoverable: false,
          };
      }
    }
  }

  // Fallback generic
  return {
    title: 'เกิดข้อผิดพลาดในการเล่นวิดีโอ',
    message: errObj.message || 'ไม่สามารถเล่นวิดีโอได้ กรุณาลองใหม่อีกครั้ง',
    isRecoverable: true,
  };
}
