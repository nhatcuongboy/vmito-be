# Requirements Document

## Introduction

Tính năng "Gợi ý kèo" (Session Recommendations) trên trang chi tiết kèo nhằm tăng tỷ lệ tham gia vào các kèo bằng cách giúp người chơi dễ dàng tìm thấy các lựa chọn thay thế phù hợp khi kèo hiện tại đã hết chỗ hoặc không phù hợp về thời gian. Hệ thống sử dụng thuật toán AI-powered để gợi ý các kèo tương tự dựa trên địa điểm, trình độ, thời gian và host.

## Glossary

- **Session**: Một kèo cầu lông được tổ chức bởi host
- **Recommendation_Engine**: Hệ thống gợi ý kèo dựa trên thuật toán AI
- **Detail_Page**: Trang chi tiết của một kèo cụ thể (sessions/[id])
- **Recommendation_Card**: Thẻ hiển thị thông tin rút gọn của kèo được gợi ý
- **Current_Session**: Kèo mà người dùng đang xem chi tiết
- **Similar_Session**: Kèo được gợi ý có đặc điểm tương tự với Current_Session
- **Host**: Người tổ chức kèo
- **Player**: Người chơi/người dùng xem trang chi tiết kèo
- **Slot**: Vị trí chơi trong một kèo
- **Level**: Trình độ chơi cầu lông (1-7: Beginner to Pro)
- **Venue**: Địa điểm/sân cầu lông
- **Mobile_View**: Giao diện hiển thị trên thiết bị di động
- **Desktop_View**: Giao diện hiển thị trên máy tính để bàn
- **Horizontal_Scroll**: Danh sách cuộn ngang
- **AI_Badge**: Nhãn "AI gợi ý" hiển thị trên thẻ gợi ý
- **Quick_Switch_Banner**: Thông báo nổi bật khi kèo hiện tại không khả dụng
- **Backend_API**: API endpoint cung cấp danh sách kèo gợi ý
- **Radius**: Bán kính tìm kiếm địa điểm (đơn vị: km)

## Requirements

### Requirement 1: Session-Based Recommendation Endpoint

**User Story:** As a Player, I want to receive personalized session recommendations based on the current session I'm viewing, so that I can quickly find alternative sessions that match my preferences.

#### Acceptance Criteria

1. WHEN a Player views a session detail page, THE Backend_API SHALL provide session recommendations based on the Current_Session's attributes
2. THE Recommendation_Engine SHALL prioritize Similar_Sessions with the same Venue or Venues within 3km Radius
3. THE Recommendation_Engine SHALL prioritize Similar_Sessions with matching or adjacent Level requirements (within ±1 level)
4. THE Recommendation_Engine SHALL prioritize Similar_Sessions with start times within 4 hours of the Current_Session's start time
5. THE Recommendation_Engine SHALL include Similar_Sessions hosted by the same Host with higher priority
6. THE Recommendation_Engine SHALL exclude the Current_Session from recommendations
7. THE Recommendation_Engine SHALL exclude sessions where the Player has already joined
8. THE Recommendation_Engine SHALL return only sessions with status "PREPARING" and end time after current time
9. THE Backend_API SHALL return recommendations sorted by relevance score in descending order
10. THE Backend_API SHALL support pagination with configurable page size (default 12 items)

### Requirement 2: Recommendation Scoring Algorithm

**User Story:** As a Player, I want the most relevant sessions to appear first in recommendations, so that I can quickly identify the best alternatives.

#### Acceptance Criteria

1. THE Recommendation_Engine SHALL calculate a relevance score for each Similar_Session based on multiple weighted factors
2. THE Recommendation_Engine SHALL assign 30% weight to location proximity (same venue = 1.0, within 1km = 0.8, within 3km = 0.5, beyond 3km = 0.0)
3. THE Recommendation_Engine SHALL assign 25% weight to level matching (exact match = 1.0, ±1 level = 0.7, ±2 levels = 0.4, beyond = 0.0)
4. THE Recommendation_Engine SHALL assign 20% weight to time proximity (within 2 hours = 1.0, within 4 hours = 0.6, same day = 0.3, different day = 0.0)
5. THE Recommendation_Engine SHALL assign 15% weight to same host (same host = 1.0, different host = 0.0)
6. THE Recommendation_Engine SHALL assign 10% weight to available slots (4+ slots = 1.0, 2-3 slots = 0.6, 1 slot = 0.3, 0 slots = 0.0)
7. THE Recommendation_Engine SHALL return match reasons for each Similar_Session (e.g., "same_venue", "similar_level", "same_host", "nearby_time")
8. FOR ALL Similar_Sessions with equal scores, THE Recommendation_Engine SHALL sort by start time ascending

### Requirement 3: Mobile Recommendation Display

**User Story:** As a Player using a mobile device, I want to see session recommendations at the bottom of the detail page, so that I can easily explore alternatives after viewing the current session.

#### Acceptance Criteria

1. WHEN a Player views a session detail page on Mobile_View, THE Detail_Page SHALL display recommendations section below the main content
2. THE Mobile_View SHALL display recommendations as Horizontal_Scroll cards
3. THE Recommendation_Card SHALL occupy 75% of screen width
4. THE Recommendation_Card SHALL display session cover image, venue name, start time, fee amount, and available slots
5. THE Recommendation_Card SHALL display AI_Badge with purple color (#8B5CF6) and text "AI gợi ý"
6. THE Recommendation_Card SHALL use system font var(--font-geist-sans) and brand colors
7. WHEN no recommendations are available, THE Detail_Page SHALL hide the recommendations section
8. THE Recommendation_Card SHALL be tappable and navigate to the corresponding session detail page

### Requirement 4: Desktop Recommendation Display

**User Story:** As a Player using a desktop computer, I want to see session recommendations in the sidebar, so that I can quickly compare alternatives while viewing the current session details.

#### Acceptance Criteria

1. WHEN a Player views a session detail page on Desktop_View, THE Detail_Page SHALL display recommendations in the right sidebar
2. THE Desktop_View SHALL display recommendations below the price card and action buttons
3. THE Desktop_View SHALL display recommendations as a vertical list with compact cards
4. THE Recommendation_Card SHALL display session cover thumbnail, venue name, start time, and fee amount
5. THE Recommendation_Card SHALL display AI_Badge with purple color (#8B5CF6) and text "AI gợi ý"
6. THE Desktop_View SHALL show maximum 5 recommendations initially
7. WHERE more than 5 recommendations exist, THE Desktop_View SHALL display a "Xem thêm" (See more) button
8. THE Recommendation_Card SHALL be clickable and navigate to the corresponding session detail page

### Requirement 5: Quick Switch Banner for Unavailable Sessions

**User Story:** As a Player, I want to see a prominent notification with alternative sessions when the current session is full or expired, so that I can quickly find available options without searching manually.

#### Acceptance Criteria

1. WHEN the Current_Session has status "FINISHED" or "CANCELLED", THE Detail_Page SHALL display Quick_Switch_Banner
2. WHEN the Current_Session has zero available slots, THE Detail_Page SHALL display Quick_Switch_Banner
3. WHEN the Current_Session's end time is before current time, THE Detail_Page SHALL display Quick_Switch_Banner
4. THE Quick_Switch_Banner SHALL display message "Kèo này đã [hết chỗ/kết thúc], AI tìm thấy [N] kèo tương tự cho bạn"
5. THE Quick_Switch_Banner SHALL display up to 3 top-scored Similar_Sessions as inline cards
6. THE Quick_Switch_Banner SHALL include a "Xem tất cả gợi ý" (View all suggestions) button
7. THE Quick_Switch_Banner SHALL appear above the main session details
8. THE Quick_Switch_Banner SHALL use attention-grabbing styling (yellow/orange background, bold text)

### Requirement 6: Recommendation Data Freshness

**User Story:** As a Player, I want recommendations to reflect real-time session availability, so that I don't see sessions that are already full or cancelled.

#### Acceptance Criteria

1. WHEN the Detail_Page loads, THE Backend_API SHALL fetch recommendations with current session data
2. THE Backend_API SHALL include real-time available slot counts in recommendation responses
3. THE Backend_API SHALL exclude sessions with status "CANCELLED" or "FINISHED"
4. THE Backend_API SHALL exclude sessions with end time before current server time
5. THE Recommendation_Card SHALL display accurate available slot count at render time
6. WHEN a Player returns to the Detail_Page after 5 minutes, THE Detail_Page SHALL refresh recommendations

### Requirement 7: Recommendation Analytics Tracking

**User Story:** As a Product Manager, I want to track recommendation interactions, so that I can measure the feature's effectiveness in increasing session participation.

#### Acceptance Criteria

1. WHEN recommendations are displayed, THE Detail_Page SHALL log a "recommendations_viewed" event with Current_Session ID and count of recommendations shown
2. WHEN a Player clicks a Recommendation_Card, THE Detail_Page SHALL log a "recommendation_clicked" event with Current_Session ID, clicked Similar_Session ID, and relevance score
3. WHEN a Player clicks Quick_Switch_Banner, THE Detail_Page SHALL log a "quick_switch_clicked" event with Current_Session ID
4. THE Detail_Page SHALL include recommendation source ("detail_page_sidebar" or "detail_page_bottom" or "quick_switch_banner") in all analytics events
5. THE Backend_API SHALL log recommendation generation time and number of candidates evaluated

### Requirement 8: Recommendation Performance Requirements

**User Story:** As a Player, I want recommendations to load quickly without delaying the main session details, so that I have a smooth browsing experience.

#### Acceptance Criteria

1. THE Backend_API SHALL return recommendation results within 500ms for 95% of requests
2. THE Detail_Page SHALL load recommendations asynchronously without blocking main content rendering
3. WHEN recommendations are loading, THE Detail_Page SHALL display a skeleton loader in the recommendations section
4. IF recommendation loading fails, THE Detail_Page SHALL hide the recommendations section without showing an error
5. THE Backend_API SHALL cache venue distance calculations for 1 hour
6. THE Backend_API SHALL limit recommendation candidate evaluation to 100 sessions maximum

### Requirement 9: Recommendation Accessibility

**User Story:** As a Player using assistive technology, I want recommendations to be accessible, so that I can navigate and understand suggested sessions.

#### Acceptance Criteria

1. THE Recommendation_Card SHALL include descriptive alt text for session cover images
2. THE Horizontal_Scroll SHALL be keyboard navigable with arrow keys
3. THE Recommendation_Card SHALL have focus indicators meeting WCAG 2.1 AA standards
4. THE AI_Badge SHALL include aria-label "AI-powered recommendation"
5. THE Quick_Switch_Banner SHALL have role="alert" for screen reader announcement
6. THE Recommendation_Card SHALL include semantic HTML with proper heading hierarchy

### Requirement 10: Recommendation Fallback Behavior

**User Story:** As a Player, I want to see general recommendations when no similar sessions are found, so that I still have options to explore.

#### Acceptance Criteria

1. WHEN no Similar_Sessions match the scoring criteria above 0.3 threshold, THE Recommendation_Engine SHALL fall back to general popular sessions
2. THE Recommendation_Engine SHALL define popular sessions as sessions with highest player count in the last 7 days
3. THE Recommendation_Engine SHALL apply same exclusion rules (player already joined, cancelled sessions) to fallback recommendations
4. THE Recommendation_Card SHALL NOT display AI_Badge for fallback recommendations
5. THE Detail_Page SHALL display fallback recommendations with a different section title "Kèo phổ biến" (Popular sessions)
6. THE Recommendation_Engine SHALL limit fallback recommendations to same city as Current_Session's Venue

