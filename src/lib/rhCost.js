// Ước tính coin tiêu thụ mỗi lần chạy RunningHub.
// Rate suy từ dữ liệu chạy thật (~0,2 RH coin/giây máy thường, rất ổn định qua >100 task);
// không có API dự toán chính thức cho AI App/workflow. Plus GPU có thể cao hơn — vẫn dùng
// rate thường kèm ghi chú "ước tính".
export const RH_COINS_PER_SECOND = 0.2;

export function estimateRhCoins(avgSeconds) {
  const seconds = Number(avgSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.max(1, Math.round(seconds * RH_COINS_PER_SECOND));
}
