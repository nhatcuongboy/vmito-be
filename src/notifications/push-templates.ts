/**
 * Push notification copy per locale, keyed by `data.action`.
 *
 * Mirrors the Flutter client's `notification_content.dart` + ARB strings so a
 * push banner reads the same as the row the user later sees in the in-app
 * inbox. Keep the two in sync: an action present here but not in the app (or
 * the reverse) means the lock screen and the inbox disagree.
 *
 * Placeholders use `{name}` and are filled from `Notification.data`
 * (see push-localization.ts).
 */
export const PUSH_LOCALES = ['vi', 'en', 'zh'] as const;
export type PushLocale = (typeof PUSH_LOCALES)[number];

/** Used when the device never reported a locale, or reported an unsupported one. */
export const DEFAULT_PUSH_LOCALE: PushLocale = 'vi';

export type LocalizedText = Record<PushLocale, string>;

export interface PushTemplate {
  title: LocalizedText;
  message: LocalizedText;
  /** Used instead of `message` when `data[param]` is a non-empty string. */
  messageWhen?: { param: string; message: LocalizedText };
}

export const PUSH_TEMPLATES: Record<string, PushTemplate> = {
  start_reminder: {
    title: {
      vi: 'Kèo sắp bắt đầu!',
      en: 'Session starting soon!',
      zh: '即将开始!',
    },
    message: {
      vi: 'Đã đến giờ cho kèo "{sessionName}". Bạn đã có mặt tại sân chưa? Nhấn để bắt đầu.',
      en: 'It\'s time for session "{sessionName}". Are you at the venue? Tap to start.',
      zh: '"{sessionName}" 即将开始。您到达场地了吗？点击开始。',
    },
  },
  player_start_reminder: {
    title: {
      vi: 'Kèo sắp bắt đầu!',
      en: 'Session starting soon!',
      zh: '即将开始!',
    },
    message: {
      vi: 'Kèo "{sessionName}" sắp bắt đầu. Hãy di chuyển ra sân!',
      en: 'Session "{sessionName}" is about to start. Head to the courts!',
      zh: '"{sessionName}" 即将开始。请前往球场！',
    },
  },
  players_selected: {
    title: {
      vi: 'Đến lượt bạn!',
      en: 'Your turn!',
      zh: '轮到你了!',
    },
    message: {
      vi: 'Vui lòng vào {courtName}. Trận của bạn sắp bắt đầu.',
      en: 'Please go to {courtName}. Your match is starting soon.',
      zh: '请前往 {courtName}。您的比赛即将开始。',
    },
  },
  auto_started: {
    title: {
      vi: 'Kèo đã tự động bắt đầu',
      en: 'Session auto-started',
      zh: '自动开始',
    },
    message: {
      vi: 'Kèo "{sessionName}" đã được tự động bắt đầu đúng giờ đã lên lịch.',
      en: 'Session "{sessionName}" has been automatically started at the scheduled time.',
      zh: '"{sessionName}" 已在计划时间自动开始。',
    },
  },
  session_auto_started: {
    title: {
      vi: 'Kèo đã bắt đầu!',
      en: 'Session started!',
      zh: '已开始!',
    },
    message: {
      vi: 'Kèo "{sessionName}" đã bắt đầu. Hãy ra sân thôi!',
      en: 'Session "{sessionName}" has started. Time to play!',
      zh: '"{sessionName}" 已开始。开始游戏吧！',
    },
  },
  auto_cancelled: {
    title: {
      vi: 'Kèo đã bị huỷ tự động',
      en: 'Session auto-cancelled',
      zh: '自动取消',
    },
    message: {
      vi: 'Kèo "{sessionName}" đã bị huỷ tự động vì không được bắt đầu trong vòng 30 phút.',
      en: 'Session "{sessionName}" was automatically cancelled as it wasn\'t started within 30 minutes.',
      zh: '"{sessionName}" 已自动取消，因为30分钟内未开始。',
    },
  },
  session_cancelled: {
    title: {
      vi: 'Kèo đã bị huỷ',
      en: 'Session cancelled',
      zh: '已取消',
    },
    message: {
      vi: 'Kèo "{sessionName}" đã bị hệ thống huỷ. Host không bắt đầu đúng giờ.',
      en: 'Session "{sessionName}" was cancelled by the system. The host didn\'t start on time.',
      zh: '"{sessionName}" 已被系统取消。主持人未按时开始。',
    },
  },
  end_warning: {
    title: {
      vi: 'Kèo sắp kết thúc',
      en: 'Session ending soon',
      zh: '即将结束',
    },
    message: {
      vi: 'Kèo "{sessionName}" sẽ kết thúc sau khoảng 15 phút.',
      en: 'Session "{sessionName}" will end in about 15 minutes.',
      zh: '"{sessionName}" 将在约15分钟后结束。',
    },
  },
  auto_finalized: {
    title: {
      vi: 'Kèo đã được hoàn tất',
      en: 'Session auto-finalized',
      zh: '自动完成',
    },
    message: {
      vi: 'Kèo "{sessionName}" đã được hệ thống tự động hoàn tất sau khi hết thời gian gia hạn.',
      en: 'Session "{sessionName}" has been automatically finalized after the grace period expired.',
      zh: '"{sessionName}" 已在宽限期结束后自动完成。',
    },
  },
  club_creation_pending: {
    title: {
      vi: 'Nhóm đang chờ phê duyệt',
      en: 'Club pending approval',
      zh: '等待审批',
    },
    message: {
      vi: 'Nhóm "{clubName}" của bạn đang chờ Admin phê duyệt.',
      en: 'Your club "{clubName}" is pending admin approval.',
      zh: '您的俱乐部 "{clubName}" 正在等待管理员审批。',
    },
  },
  admin_new_pending_club: {
    title: {
      vi: 'Nhóm mới đang chờ duyệt',
      en: 'New club pending approval',
      zh: '新俱乐部等待审批',
    },
    message: {
      vi: 'Nhóm "{clubName}" đang chờ phê duyệt.',
      en: 'Club "{clubName}" is pending approval.',
      zh: '俱乐部 "{clubName}" 正在等待审批。',
    },
  },
  admin_new_contact: {
    title: {
      vi: 'Liên hệ mới',
      en: 'New contact message',
      zh: '新的联系消息',
    },
    message: {
      vi: '{userName} vừa gửi "{feedbackTitle}".',
      en: '{userName} sent "{feedbackTitle}".',
      zh: '{userName} 提交了“{feedbackTitle}”。',
    },
  },
  admin_new_bug_report: {
    title: {
      vi: 'Báo lỗi mới',
      en: 'New bug report',
      zh: '新的问题反馈',
    },
    message: {
      vi: '{userName} vừa gửi "{feedbackTitle}".',
      en: '{userName} sent "{feedbackTitle}".',
      zh: '{userName} 提交了“{feedbackTitle}”。',
    },
  },
  club_creation_approved: {
    title: {
      vi: 'Nhóm đã được tạo thành công',
      en: 'Club created successfully',
      zh: '创建成功',
    },
    message: {
      vi: 'Nhóm "{clubName}" đã được tạo và phê duyệt thành công.',
      en: 'Club "{clubName}" has been created and approved.',
      zh: '俱乐部 "{clubName}" 已创建并批准。',
    },
  },
  club_approved: {
    title: {
      vi: 'Nhóm đã được phê duyệt',
      en: 'Club approved',
      zh: '已批准',
    },
    message: {
      vi: 'Nhóm "{clubName}" của bạn đã được phê duyệt.',
      en: 'Your club "{clubName}" has been approved.',
      zh: '您的俱乐部 "{clubName}" 已获批准。',
    },
  },
  club_rejected: {
    title: {
      vi: 'Nhóm đã bị từ chối',
      en: 'Club rejected',
      zh: '已拒绝',
    },
    message: {
      vi: 'Nhóm "{clubName}" của bạn đã bị từ chối. Lý do: {rejectionReason}',
      en: 'Your club "{clubName}" has been rejected. Reason: {rejectionReason}',
      zh: '您的俱乐部 "{clubName}" 已被拒绝。原因：{rejectionReason}',
    },
  },
  player_added: {
    title: {
      vi: 'Bạn đã được thêm vào kèo',
      en: 'You were added to a session',
      zh: '已添加到会话',
    },
    message: {
      vi: 'Bạn đã được thêm vào kèo "{sessionName}".',
      en: 'You have been added to session "{sessionName}".',
      zh: '您已被添加到会话 "{sessionName}"。',
    },
  },
  player_removed: {
    title: {
      vi: 'Bạn đã bị xóa khỏi kèo',
      en: 'You were removed from a session',
      zh: '已从会话中移除',
    },
    message: {
      vi: 'Bạn đã bị xóa khỏi kèo "{sessionName}".',
      en: 'You have been removed from session "{sessionName}".',
      zh: '您已从会话 "{sessionName}" 中移除。',
    },
  },
  post_liked: {
    title: {
      vi: 'Có người thích bài viết của bạn',
      en: 'Someone liked your post',
      zh: '有人喜欢你的帖子',
    },
    message: {
      vi: '{actorName} đã thích bài viết của bạn.',
      en: '{actorName} liked your post.',
      zh: '{actorName} 喜欢了你的帖子。',
    },
  },
  post_commented: {
    title: {
      vi: 'Bình luận mới về bài viết của bạn',
      en: 'New comment on your post',
      zh: '新评论',
    },
    message: {
      vi: '{actorName} đã bình luận về bài viết của bạn.',
      en: '{actorName} commented on your post.',
      zh: '{actorName} 评论了你的帖子。',
    },
  },
  session_favorited: {
    title: {
      vi: 'Có người Thích kèo của bạn',
      en: 'Someone favorited your session',
      zh: '有人收藏了你的会话',
    },
    message: {
      vi: '{actorName} đã Thích kèo "{sessionName}".',
      en: '{actorName} favorited session "{sessionName}".',
      zh: '{actorName} 收藏了会话 "{sessionName}"。',
    },
  },
  club_favorited: {
    title: {
      vi: 'Có người Thích nhóm của bạn',
      en: 'Someone favorited your club',
      zh: '有人收藏了你的俱乐部',
    },
    message: {
      vi: '{actorName} đã Thích nhóm "{clubName}".',
      en: '{actorName} favorited club "{clubName}".',
      zh: '{actorName} 收藏了俱乐部 "{clubName}"。',
    },
  },
  tournament_favorited: {
    title: {
      vi: 'Có người Thích giải đấu của bạn',
      en: 'Someone favorited your tournament',
      zh: '有人收藏了你的锦标赛',
    },
    message: {
      vi: '{actorName} đã Thích giải đấu "{tournamentName}".',
      en: '{actorName} favorited tournament "{tournamentName}".',
      zh: '{actorName} 收藏了锦标赛 "{tournamentName}"。',
    },
  },
  tournament_registration_submitted: {
    title: {
      vi: 'Có đơn đăng ký giải mới',
      en: 'New tournament registration',
      zh: '新的赛事报名',
    },
    message: {
      vi: '{requesterName} đăng ký nội dung {categoryName} ở giải "{tournamentName}".',
      en: '{requesterName} registered for {categoryName} in "{tournamentName}".',
      zh: '{requesterName} 报名了“{tournamentName}”的 {categoryName}。',
    },
  },
  tournament_registration_partner_added: {
    title: {
      vi: 'Bạn được mời làm đồng đội',
      en: 'You were added as a partner',
      zh: '你被添加为搭档',
    },
    message: {
      vi: '{requesterName} đăng ký cùng bạn nội dung {categoryName} ở giải "{tournamentName}".',
      en: '{requesterName} registered with you for {categoryName} in "{tournamentName}".',
      zh: '{requesterName} 与你一起报名了“{tournamentName}”的 {categoryName}。',
    },
  },
  tournament_registration_approved: {
    title: {
      vi: 'Đơn đăng ký giải đã được duyệt',
      en: 'Tournament registration approved',
      zh: '赛事报名已通过',
    },
    message: {
      vi: 'Đơn nội dung {categoryName} ở giải "{tournamentName}" đã được duyệt.',
      en: 'Your {categoryName} registration in "{tournamentName}" was approved.',
      zh: '你在“{tournamentName}”的 {categoryName} 报名已通过。',
    },
  },
  tournament_registration_rejected: {
    title: {
      vi: 'Đơn đăng ký giải bị từ chối',
      en: 'Tournament registration rejected',
      zh: '赛事报名被拒绝',
    },
    message: {
      vi: 'Đơn nội dung {categoryName} ở giải "{tournamentName}" bị từ chối.',
      en: 'Your {categoryName} registration in "{tournamentName}" was rejected.',
      zh: '你在“{tournamentName}”的 {categoryName} 报名被拒绝。',
    },
    messageWhen: {
      param: 'response',
      message: {
        vi: 'Đơn nội dung {categoryName} ở giải "{tournamentName}" bị từ chối: {reason}',
        en: 'Your {categoryName} registration in "{tournamentName}" was rejected: {reason}',
        zh: '你在“{tournamentName}”的 {categoryName} 报名被拒绝：{reason}',
      },
    },
  },
  venue_request_approved: {
    title: {
      vi: 'Yêu cầu thông tin sân đã được phê duyệt',
      en: 'Venue request approved',
      zh: '场地请求已批准',
    },
    message: {
      vi: 'Đề xuất về sân "{venueName}" của bạn đã được quản trị viên phê duyệt.',
      en: 'Your proposal for venue "{venueName}" has been approved by administrators.',
      zh: '您关于场地 "{venueName}" 的提案已被管理员批准。',
    },
  },
  venue_request_rejected: {
    title: {
      vi: 'Yêu cầu thông tin sân bị từ chối',
      en: 'Venue request rejected',
      zh: '场地请求被拒绝',
    },
    message: {
      vi: 'Đề xuất về sân "{venueName}" của bạn bị từ chối. Lý do: {rejectionReason}',
      en: 'Your proposal for venue "{venueName}" was rejected. Reason: {rejectionReason}',
      zh: '您关于场地 "{venueName}" 的提案被拒绝。原因：{rejectionReason}',
    },
  },
  tier_up: {
    title: {
      vi: 'Thăng hạng!',
      en: 'Rank up!',
      zh: '段位提升！',
    },
    message: {
      vi: 'Chúc mừng! Bạn đã đạt hạng {tier} với {totalPoints} điểm xếp hạng.',
      en: 'Congratulations! You reached the {tier} tier with {totalPoints} ranking points.',
      zh: '恭喜！你已达到{tier}段位，积分 {totalPoints}。',
    },
  },
  class_favorited: {
    title: {
      vi: 'Có người Thích lớp học của bạn',
      en: 'Someone favorited your class',
      zh: '有人收藏了你的课程',
    },
    message: {
      vi: '{actorName} đã Thích lớp học "{className}".',
      en: '{actorName} favorited class "{className}".',
      zh: '{actorName} 收藏了课程 "{className}"。',
    },
  },
  chat_request: {
    title: {
      vi: 'Yêu cầu trò chuyện mới',
      en: 'New chat request',
      zh: '新的聊天请求',
    },
    message: {
      vi: '{senderName} muốn nhắn tin với bạn',
      en: '{senderName} wants to message you',
      zh: '{senderName} 想与你聊天',
    },
  },
  payment_reminder_pending: {
    title: {
      vi: 'Nhắc nhở thanh toán',
      en: 'Payment reminder',
      zh: '付款提醒',
    },
    message: {
      vi: 'Bạn có một khoản thanh toán {amount} đang chờ xử lý.',
      en: 'You have a pending payment of {amount}.',
      zh: '你有一笔 {amount} 的付款待处理。',
    },
  },
  payment_reminder_aggregate: {
    title: {
      vi: 'Nhắc nhở thanh toán',
      en: 'Payment reminder',
      zh: '付款提醒',
    },
    message: {
      vi: 'Bạn có {count} khoản thanh toán chưa hoàn tất, tổng cộng {amount}.',
      en: 'You have {count} unpaid payments, {amount} in total.',
      zh: '你有 {count} 笔未完成的付款，共计 {amount}。',
    },
  },
  payment_reminder_custom: {
    title: {
      vi: 'Nhắc nhở thanh toán',
      en: 'Payment reminder',
      zh: '付款提醒',
    },
    message: {
      vi: 'Bạn có một lời nhắc thanh toán {amount}: {note}',
      en: 'You have a payment reminder of {amount}: {note}',
      zh: '你有一条 {amount} 的付款提醒：{note}',
    },
  },
  payment_reminder_again: {
    title: {
      vi: 'Nhắc nhở thanh toán',
      en: 'Payment reminder',
      zh: '付款提醒',
    },
    message: {
      vi: 'Nhắc lại: bạn có một khoản thanh toán {amount} đang chờ xử lý.',
      en: 'Reminder: you have a pending payment of {amount}.',
      zh: '再次提醒：你有一笔 {amount} 的付款待处理。',
    },
  },
  payment_collected: {
    title: {
      vi: 'Đã xác nhận thu tiền',
      en: 'Payment collected',
      zh: '已确认收款',
    },
    message: {
      vi: 'Khoản thanh toán {amount} đã được xác nhận là đã thu.',
      en: 'Your payment of {amount} has been confirmed as collected.',
      zh: '你的 {amount} 付款已确认收到。',
    },
  },
  payment_proof_submitted: {
    title: {
      vi: 'Đã gửi minh chứng thanh toán',
      en: 'Payment proof submitted',
      zh: '已提交付款凭证',
    },
    message: {
      vi: 'Người dùng đã gửi minh chứng đã trả cho khoản {amount}, vui lòng xác nhận.',
      en: 'A payment proof was submitted for {amount}. Please confirm.',
      zh: '用户已提交 {amount} 的付款凭证，请确认。',
    },
  },
  payment_proof_rejected: {
    title: {
      vi: 'Minh chứng thanh toán bị từ chối',
      en: 'Payment proof rejected',
      zh: '付款凭证被拒绝',
    },
    message: {
      vi: 'Minh chứng đã trả bị từ chối, vui lòng gửi lại.',
      en: 'Your payment proof was rejected. Please submit it again.',
      zh: '你的付款凭证被拒绝，请重新提交。',
    },
    messageWhen: {
      param: 'hostNotes',
      message: {
        vi: 'Minh chứng đã trả bị từ chối: {hostNotes}. Vui lòng gửi lại.',
        en: 'Your payment proof was rejected: {hostNotes}. Please submit it again.',
        zh: '你的付款凭证被拒绝：{hostNotes}。请重新提交。',
      },
    },
  },
  rental_manual_created: {
    title: {
      vi: 'Lịch thuê sân đã được tạo',
      en: 'Court booking created',
      zh: '场地租用已创建',
    },
    message: {
      vi: 'Quản lý sân đã tạo và xác nhận lịch thuê cho bạn.',
      en: 'The venue manager created and confirmed a booking for you.',
      zh: '场地管理员已为你创建并确认租用。',
    },
  },
  rental_awaiting_deposit: {
    title: {
      vi: 'Yêu cầu thuê sân đang chờ đặt cọc',
      en: 'Booking request awaiting deposit',
      zh: '租用申请等待支付定金',
    },
    message: {
      vi: 'Vui lòng hoàn tất đặt cọc trước thời hạn để giữ sân.',
      en: 'Please complete the deposit before the deadline to keep the court.',
      zh: '请在截止时间前完成定金支付以保留球场。',
    },
  },
  rental_confirmed: {
    title: {
      vi: 'Yêu cầu thuê sân đã được xác nhận',
      en: 'Booking request confirmed',
      zh: '租用申请已确认',
    },
    message: {
      vi: 'Sân đã xác nhận lịch thuê của bạn.',
      en: 'The venue has confirmed your booking.',
      zh: '场地已确认你的租用。',
    },
  },
  rental_rejected: {
    title: {
      vi: 'Yêu cầu thuê sân bị từ chối',
      en: 'Booking request rejected',
      zh: '租用申请被拒绝',
    },
    message: {
      vi: '{reason}',
      en: '{reason}',
      zh: '{reason}',
    },
  },
  rental_proposal_created: {
    title: {
      vi: 'Sân đề xuất lịch thuê mới',
      en: 'New booking proposal from the venue',
      zh: '场地提出了新的租用方案',
    },
    message: {
      vi: 'Vui lòng xem và phản hồi đề xuất mới.',
      en: 'Please review and respond to the new proposal.',
      zh: '请查看并回复新的方案。',
    },
  },
  rental_proposal_awaiting_deposit: {
    title: {
      vi: 'Lịch thuê sân đang chờ đặt cọc',
      en: 'Booking awaiting deposit',
      zh: '租用等待支付定金',
    },
    message: {
      vi: 'Vui lòng hoàn tất đặt cọc trước thời hạn để giữ sân.',
      en: 'Please complete the deposit before the deadline to keep the court.',
      zh: '请在截止时间前完成定金支付以保留球场。',
    },
  },
  rental_cancelled_by_manager: {
    title: {
      vi: 'Lịch thuê sân đã bị hủy',
      en: 'Court booking cancelled',
      zh: '场地租用已取消',
    },
    message: {
      vi: 'Quản lý sân đã hủy lịch thuê.',
      en: 'The venue manager cancelled the booking.',
      zh: '场地管理员已取消租用。',
    },
    messageWhen: {
      param: 'reason',
      message: {
        vi: '{reason}',
        en: '{reason}',
        zh: '{reason}',
      },
    },
  },
  rental_proposal_expired: {
    title: {
      vi: 'Đề xuất thuê sân đã hết hạn',
      en: 'Booking proposal expired',
      zh: '租用方案已过期',
    },
    message: {
      vi: 'Bạn có thể chờ quản lý gửi đề xuất mới.',
      en: 'You can wait for the manager to send a new proposal.',
      zh: '你可以等待管理员发送新的方案。',
    },
  },
  rental_deposit_approved: {
    title: {
      vi: 'Đặt cọc đã được duyệt',
      en: 'Deposit approved',
      zh: '定金已通过',
    },
    message: {
      vi: 'Lịch thuê sân của bạn đã được xác nhận.',
      en: 'Your court booking has been confirmed.',
      zh: '你的场地租用已确认。',
    },
  },
  rental_payment_recorded: {
    title: {
      vi: 'Thanh toán đã được ghi nhận',
      en: 'Payment recorded',
      zh: '付款已记录',
    },
    message: {
      vi: 'Quản lý sân đã ghi nhận thanh toán tiền mặt.',
      en: 'The venue manager recorded your cash payment.',
      zh: '场地管理员已记录你的现金付款。',
    },
  },
  rental_payment_approved: {
    title: {
      vi: 'Thanh toán đã được duyệt',
      en: 'Payment approved',
      zh: '付款已通过',
    },
    message: {
      vi: 'Giao dịch thuê sân của bạn đã được duyệt.',
      en: 'Your court booking payment has been approved.',
      zh: '你的场地租用付款已通过。',
    },
  },
  rental_payment_rejected: {
    title: {
      vi: 'Chứng từ thanh toán bị từ chối',
      en: 'Payment proof rejected',
      zh: '付款凭证被拒绝',
    },
    message: {
      vi: '{reason}',
      en: '{reason}',
      zh: '{reason}',
    },
  },
  rental_refund_completed: {
    title: {
      vi: 'Hoàn tiền thuê sân đã hoàn tất',
      en: 'Booking refund completed',
      zh: '租用退款已完成',
    },
    message: {
      vi: 'Quản lý sân đã xác nhận hoàn tiền cho bạn.',
      en: 'The venue manager confirmed your refund.',
      zh: '场地管理员已确认向你退款。',
    },
  },
  rental_deposit_expired: {
    title: {
      vi: 'Yêu cầu thuê sân đã hết hạn đặt cọc',
      en: 'Booking deposit deadline passed',
      zh: '租用定金已过期',
    },
    message: {
      vi: 'Lịch giữ sân đã được giải phóng vì chưa đủ tiền cọc.',
      en: 'The court hold was released because the deposit was not completed.',
      zh: '由于未付足定金，球场保留已被释放。',
    },
  },
  rental_deposit_reminder: {
    title: {
      vi: 'Sắp hết hạn đặt cọc thuê sân',
      en: 'Booking deposit deadline approaching',
      zh: '租用定金即将到期',
    },
    message: {
      vi: 'Vui lòng hoàn tất đặt cọc trong 5 phút tới.',
      en: 'Please complete the deposit within the next 5 minutes.',
      zh: '请在未来 5 分钟内完成定金支付。',
    },
  },
  rental_balance_overdue: {
    title: {
      vi: 'Thanh toán thuê sân đã quá hạn',
      en: 'Booking payment overdue',
      zh: '租用付款已逾期',
    },
    message: {
      vi: 'Vui lòng thanh toán phần còn lại cho lịch thuê sân.',
      en: 'Please pay the remaining balance for your court booking.',
      zh: '请支付场地租用的剩余款项。',
    },
  },
  rental_request_created: {
    title: {
      vi: 'Yêu cầu thuê sân mới',
      en: 'New booking request',
      zh: '新的租用申请',
    },
    message: {
      vi: 'Có một yêu cầu thuê sân mới cần xử lý.',
      en: 'A new court booking request needs your attention.',
      zh: '有一个新的场地租用申请需要处理。',
    },
  },
  rental_proposal_accepted: {
    title: {
      vi: 'Đề xuất thuê sân đã được chấp nhận',
      en: 'Booking proposal accepted',
      zh: '租用方案已被接受',
    },
    message: {
      vi: 'Người thuê đã chấp nhận lịch đề xuất.',
      en: 'The renter accepted the proposed schedule.',
      zh: '租用方已接受建议的时间安排。',
    },
  },
  rental_proposal_declined: {
    title: {
      vi: 'Đề xuất thuê sân bị từ chối',
      en: 'Booking proposal declined',
      zh: '租用方案被拒绝',
    },
    message: {
      vi: 'Người thuê đã từ chối lịch đề xuất.',
      en: 'The renter declined the proposed schedule.',
      zh: '租用方已拒绝建议的时间安排。',
    },
  },
  rental_refund_required: {
    title: {
      vi: 'Có khoản hoàn tiền thuê sân cần xử lý',
      en: 'A booking refund needs processing',
      zh: '有租用退款需要处理',
    },
    message: {
      vi: 'Booking đã hủy có khoản hoàn tiền đang chờ xử lý.',
      en: 'A cancelled booking has a refund waiting to be processed.',
      zh: '已取消的租用有一笔退款等待处理。',
    },
  },
  rental_deposit_expired_refund: {
    title: {
      vi: 'Có khoản hoàn tiền thuê sân cần xử lý',
      en: 'A booking refund needs processing',
      zh: '有租用退款需要处理',
    },
    message: {
      vi: 'Booking hết hạn đặt cọc có khoản tiền cần hoàn.',
      en: 'A booking whose deposit expired has money to refund.',
      zh: '定金已过期的租用有款项需要退还。',
    },
  },
  rental_cancelled_by_requester: {
    title: {
      vi: 'Yêu cầu thuê sân đã bị hủy',
      en: 'Booking request cancelled',
      zh: '租用申请已取消',
    },
    message: {
      vi: 'Người thuê đã hủy yêu cầu.',
      en: 'The renter cancelled the request.',
      zh: '租用方已取消申请。',
    },
  },
  rental_payment_submitted: {
    title: {
      vi: 'Có giao dịch thuê sân mới',
      en: 'New booking payment',
      zh: '有新的租用付款',
    },
    message: {
      vi: 'Người thuê đã gửi chứng từ thanh toán.',
      en: 'The renter submitted a payment proof.',
      zh: '租用方已提交付款凭证。',
    },
  },
  rental_balance_overdue_manager: {
    title: {
      vi: 'Booking thuê sân quá hạn thanh toán',
      en: 'Booking payment overdue',
      zh: '租用付款已逾期',
    },
    message: {
      vi: 'Một booking đã quá hạn thanh toán phần còn lại.',
      en: 'A booking is past due on its remaining balance.',
      zh: '有一笔租用已逾期未付剩余款项。',
    },
  },
  // The stored title is the sender's name, so it is passed through.
  chat_message: {
    title: { vi: '{senderName}', en: '{senderName}', zh: '{senderName}' },
    message: {
      vi: 'Đã gửi cho bạn tin nhắn mới',
      en: 'Sent you a new message',
      zh: '给你发来了新消息',
    },
  },
};
