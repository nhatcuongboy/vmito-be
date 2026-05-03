# Implementation Plan: Session Recommendations on Detail Page

## Overview

This implementation plan breaks down the Session Recommendations feature into discrete coding tasks. The feature provides AI-powered session suggestions on the session detail page using a sophisticated scoring algorithm that considers location proximity, skill level matching, time preferences, host familiarity, and slot availability.

**Technology Stack**: TypeScript, NestJS, Prisma ORM, React (Next.js)

**Key Components**:
- Backend API endpoint: `GET /sessions/:id/recommendations`
- Scoring engine with weighted factors (location 30%, level 25%, time 20%, host 15%, slots 10%)
- Frontend components for mobile (horizontal scroll) and desktop (sidebar) layouts
- Quick Switch Banner for unavailable sessions

## Tasks

- [x] 1. Set up backend scoring engine and utilities
  - Create `ScoringEngine` utility class in `src/sessions/utils/scoring-engine.ts`
  - Implement component scoring functions: `scoreLocation()`, `scoreLevel()`, `scoreTime()`, `scoreHost()`, `scoreSlots()`
  - Implement `calculateRelevanceScore()` method that combines weighted scores
  - Implement `getMatchReasons()` method to generate match reason strings
  - Add distance calculation caching logic (1 hour TTL)
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

- [ ]* 1.1 Write unit tests for scoring engine
  - Test each component scoring function with specific examples
  - Test edge cases: missing venue coordinates, empty required levels, zero available slots
  - Test weighted sum calculation accuracy
  - Test match reasons generation logic
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

- [x] 2. Implement recommendation service methods
  - [x] 2.1 Add `getSessionRecommendations()` method to `SessionsService`
    - Fetch current session with venue, host, and player relations
    - Query candidate sessions with filters (status=PREPARING, endTime>now, exclude current session)
    - Limit candidate evaluation to 100 sessions maximum
    - Exclude sessions where user has already joined
    - Calculate relevance scores for each candidate using `ScoringEngine`
    - Sort by relevance score descending, then start time ascending
    - Apply pagination (default 12 items per page)
    - Return `RecommendationResponse` with data, pagination, and meta
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_

  - [x] 2.2 Add `getFallbackRecommendations()` private method
    - Trigger when all candidate scores are below 0.3 threshold
    - Query popular sessions (highest player count in last 7 days)
    - Filter by same city as current session's venue
    - Apply same exclusion rules (user joined, cancelled, expired)
    - Return sessions without AI badge (isFallback=true in meta)
    - _Requirements: 10.1, 10.2, 10.3, 10.6_

  - [x] 2.3 Add helper method `calculateAvailableSlots()`
    - Calculate: `(numberOfCourts * maxPlayersPerCourt) - approvedPlayerCount`
    - Query approved players with `registrationStatus = 'APPROVED'`
    - Return accurate slot count for each session
    - _Requirements: 6.2_

- [ ]* 2.4 Write property-based tests for recommendation service
  - **Property 1: Scoring Correctness** - Total score equals weighted sum of components
  - **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**
  
- [ ]* 2.5 Write property-based tests for exclusion rules
  - **Property 2: Exclusion Rules** - Recommendations exclude current session, joined sessions, cancelled/finished sessions, expired sessions
  - **Validates: Requirements 1.6, 1.7, 1.8, 6.3, 6.4, 10.3**

- [ ]* 2.6 Write property-based tests for sorting
  - **Property 3: Sorting Invariant** - Recommendations sorted by score desc, then start time asc
  - **Validates: Requirements 1.9, 2.8**

- [ ]* 2.7 Write property-based tests for available slots
  - **Property 4: Available Slots Calculation** - Available slots equals max slots minus approved players
  - **Validates: Requirement 6.2**

- [ ]* 2.8 Write property-based tests for match reasons
  - **Property 5: Match Reasons Generation** - Match reasons correspond to high-scoring components
  - **Validates: Requirement 2.7**

- [ ]* 2.9 Write property-based tests for pagination
  - **Property 6: Pagination Correctness** - Pagination returns correct slice and metadata
  - **Validates: Requirement 1.10**

- [ ]* 2.10 Write property-based tests for fallback trigger
  - **Property 7: Fallback Trigger** - Fallback activates when all scores below 0.3 threshold
  - **Validates: Requirement 10.1**

- [ ]* 2.11 Write property-based tests for fallback popularity
  - **Property 8: Fallback Popularity Ranking** - Fallback sessions sorted by player count descending
  - **Validates: Requirement 10.2**

- [ ]* 2.12 Write property-based tests for fallback location
  - **Property 9: Fallback Location Filter** - Fallback recommendations limited to same city
  - **Validates: Requirement 10.6**

- [x] 3. Create API endpoint and DTOs
  - [x] 3.1 Create DTOs in `src/sessions/dto/`
    - Create `GetRecommendationsQueryDto` with validation (page, limit, userId optional)
    - Create `RecommendationResponseDto` interface
    - Create `RecommendedSessionDto` interface with all required fields
    - Add validation decorators (@IsOptional, @IsInt, @Min, @Max)
    - _Requirements: 1.10_

  - [x] 3.2 Add controller endpoint in `SessionsController`
    - Add `@Public()` decorator (no auth required)
    - Add `@Get(':id/recommendations')` route
    - Extract query parameters (page, limit, userId)
    - Call `sessionsService.getSessionRecommendations()`
    - Return `RecommendationResponse` with proper HTTP status
    - Add error handling for invalid session ID (404)
    - Add error handling for invalid pagination (400)
    - _Requirements: 1.1, 1.10_

  - [x] 3.3 Add API documentation with Swagger decorators
    - Add `@ApiOperation()` with description
    - Add `@ApiParam()` for session ID
    - Add `@ApiQuery()` for pagination parameters
    - Add `@ApiResponse()` for 200, 400, 404 status codes
    - _Requirements: 1.1_

- [ ]* 3.4 Write integration tests for API endpoint
  - Test end-to-end flow: request → service → database → response
  - Test with known test sessions and verify expected recommendations
  - Test pagination with different page/limit values
  - Test fallback behavior when no good matches
  - Test error cases: invalid session ID, invalid pagination
  - _Requirements: 1.1, 1.10, 10.1_

- [x] 4. Checkpoint - Ensure backend tests pass
  - Run all unit tests: `npm run test`
  - Run all integration tests: `npm run test:e2e`
  - Verify API endpoint returns correct data structure
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement frontend recommendation components
  - [x] 5.1 Create `RecommendationCard` component
    - Create component in `components/sessions/RecommendationCard.tsx`
    - Accept props: `session`, `variant` (mobile/desktop), `showAIBadge`, `onClick`
    - Display session cover image with fallback placeholder
    - Display venue name, start time, fee amount, available slots
    - Display AI badge with purple color (#8B5CF6) when `showAIBadge=true`
    - Implement mobile variant: 75% screen width, horizontal card layout
    - Implement desktop variant: compact vertical card for sidebar
    - Add click handler to navigate to session detail page
    - Use system font `var(--font-geist-sans)` and brand colors
    - _Requirements: 3.4, 3.5, 3.6, 4.4, 4.5_

  - [x] 5.2 Create `SessionRecommendations` container component
    - Create component in `components/sessions/SessionRecommendations.tsx`
    - Accept props: `sessionId`, `userId` (optional), `variant` (mobile/desktop)
    - Implement `useRecommendations` custom hook for data fetching
    - Fetch recommendations on component mount
    - Handle loading state with skeleton loader
    - Handle error state by hiding section (no error message)
    - Handle empty state by hiding section
    - Render mobile layout: horizontal scroll container with 75% width cards
    - Render desktop layout: vertical list in sidebar, max 5 items initially
    - Add "Xem thêm" (See more) button for desktop when more than 5 items
    - Implement pagination on "See more" click
    - _Requirements: 3.1, 3.2, 3.3, 3.7, 3.8, 4.1, 4.2, 4.3, 4.6, 4.7_

  - [x] 5.3 Create `QuickSwitchBanner` component
    - Create component in `components/sessions/QuickSwitchBanner.tsx`
    - Accept props: `currentSession`, `topRecommendations`, `onViewAll`
    - Implement conditional rendering logic (show when session unavailable)
    - Check conditions: status=FINISHED/CANCELLED, availableSlots=0, endTime<now
    - Display message: "Kèo này đã [hết chỗ/kết thúc], AI tìm thấy [N] kèo tương tự cho bạn"
    - Display top 3 recommendations as inline cards
    - Add "Xem tất cả gợi ý" (View all suggestions) button
    - Use attention-grabbing styling (yellow/orange background, bold text)
    - Add `role="alert"` for screen reader accessibility
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

- [ ]* 5.4 Write component tests for recommendation components
  - Test `RecommendationCard` rendering with mock data
  - Test mobile vs desktop layout differences
  - Test AI badge display logic
  - Test click navigation
  - Test `SessionRecommendations` loading/error/empty states
  - Test horizontal scroll on mobile
  - Test "See more" pagination on desktop
  - Test `QuickSwitchBanner` conditional rendering
  - Test banner message generation
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

- [x] 6. Integrate components into session detail page
  - [x] 6.1 Add recommendations to mobile session detail page
    - Import `SessionRecommendations` component
    - Add component below main session content
    - Pass `sessionId`, `userId`, and `variant="mobile"` props
    - Ensure proper spacing and responsive layout
    - _Requirements: 3.1, 3.2_

  - [x] 6.2 Add recommendations to desktop session detail page
    - Import `SessionRecommendations` component
    - Add component to right sidebar below price card and action buttons
    - Pass `sessionId`, `userId`, and `variant="desktop"` props
    - Ensure proper sidebar layout and spacing
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 6.3 Add Quick Switch Banner to session detail page
    - Import `QuickSwitchBanner` component
    - Add component above main session details
    - Pass `currentSession` and `topRecommendations` props
    - Implement `onViewAll` handler to scroll to recommendations section
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

- [x] 7. Implement accessibility features
  - Add descriptive alt text for session cover images
  - Implement keyboard navigation for horizontal scroll (arrow keys)
  - Add focus indicators meeting WCAG 2.1 AA standards
  - Add `aria-label="AI-powered recommendation"` to AI badge
  - Add `role="alert"` to Quick Switch Banner
  - Use semantic HTML with proper heading hierarchy
  - Test with screen reader (NVDA/JAWS)
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [ ]* 7.1 Write accessibility tests
  - Test keyboard navigation with arrow keys
  - Test focus indicators visibility
  - Test ARIA labels and roles
  - Test semantic HTML structure
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 8. Checkpoint - Ensure frontend tests pass
  - Run all component tests: `npm run test`
  - Test on mobile devices (iOS Safari, Android Chrome)
  - Test on desktop browsers (Chrome, Firefox, Safari)
  - Verify responsive layouts work correctly
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Implement analytics tracking
  - [ ] 9.1 Add analytics event logging to backend
    - Log recommendation generation time
    - Log number of candidates evaluated
    - Log fallback activation events
    - Store events in database or send to analytics service
    - _Requirements: 7.5_

  - [ ] 9.2 Add analytics event logging to frontend
    - Log "recommendations_viewed" event on component mount
    - Include: currentSessionId, recommendationCount, source (sidebar/bottom)
    - Log "recommendation_clicked" event on card click
    - Include: currentSessionId, clickedSessionId, relevanceScore, source
    - Log "quick_switch_clicked" event on banner click
    - Include: currentSessionId, source
    - Send events to analytics service (Google Analytics, Mixpanel, etc.)
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ]* 9.3 Write tests for analytics tracking
  - Test event logging on recommendations display
  - Test event logging on card click
  - Test event logging on banner click
  - Verify correct event data structure
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 10. Implement performance optimizations
  - [ ] 10.1 Add backend caching
    - Implement Redis caching for venue distance calculations (1 hour TTL)
    - Implement Redis caching for popular sessions list (15 minutes TTL)
    - Add cache warming for frequently accessed data
    - Implement stale-while-revalidate pattern
    - _Requirements: 6.5, 8.1, 8.5_

  - [ ] 10.2 Add frontend caching and lazy loading
    - Implement SWR (stale-while-revalidate) for recommendation responses (5 minutes)
    - Add lazy loading for session cover images
    - Implement intersection observer for "See more" pagination
    - Add code-splitting for recommendation components
    - Prefetch recommendations on session detail page hover
    - _Requirements: 8.2, 8.3_

  - [ ] 10.3 Optimize database queries
    - Add database indexes for filtering fields (status, endTime, venueId)
    - Use `select` to fetch only required fields
    - Implement query timeout (500ms) with partial results fallback
    - Use database connection pooling
    - _Requirements: 8.1, 8.6_

- [ ]* 10.4 Write performance tests
  - Test API response time with 100+ candidate sessions
  - Verify 95th percentile response time < 500ms
  - Test cache hit rate for venue distances (target > 80%)
  - Test cache hit rate for popular sessions (target > 60%)
  - Load test with 1000+ concurrent users
  - _Requirements: 8.1, 8.4, 8.5, 8.6_

- [ ] 11. Implement error handling and edge cases
  - [ ] 11.1 Add backend error handling
    - Handle session not found (404 response)
    - Handle invalid pagination parameters (400 response)
    - Handle missing venue coordinates (default distance score 0.5)
    - Handle database query timeout (return partial results)
    - Handle no recommendations available (empty array with 200 response)
    - Add error logging for monitoring
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ] 11.2 Add frontend error handling
    - Handle API request failure (hide section, log silently)
    - Handle network timeout (retry once, then hide section)
    - Handle invalid response data (filter out invalid items)
    - Handle image load failure (show placeholder)
    - Implement graceful degradation (non-critical feature)
    - _Requirements: 8.4_

- [ ]* 11.3 Write error handling tests
  - Test 404 response for invalid session ID
  - Test 400 response for invalid pagination
  - Test missing venue coordinates fallback
  - Test database timeout handling
  - Test frontend error states
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 8.4_

- [ ] 12. Add data freshness and cache invalidation
  - Implement automatic recommendation refresh after 5 minutes
  - Add cache invalidation on session status change
  - Add cache invalidation on session update (venue, time, level changes)
  - Ensure real-time available slot counts in responses
  - Add server-side timestamp to responses for freshness tracking
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [ ]* 12.1 Write tests for data freshness
  - Test recommendation refresh after 5 minutes
  - Test cache invalidation on session updates
  - Test real-time slot count accuracy
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [ ] 13. Final integration and end-to-end testing
  - [ ] 13.1 Run full test suite
    - Run all unit tests: `npm run test`
    - Run all integration tests: `npm run test:e2e`
    - Run all property-based tests with 100+ iterations
    - Verify all tests pass with no failures
    - _Requirements: All_

  - [ ] 13.2 Manual testing on staging environment
    - Test complete user flow: view session → see recommendations → click recommendation → view new session
    - Test Quick Switch Banner for unavailable sessions
    - Test mobile layout on iOS and Android devices
    - Test desktop layout on Chrome, Firefox, Safari
    - Test with various session scenarios (full, expired, cancelled, no matches)
    - Test fallback behavior when no similar sessions found
    - Verify analytics events are logged correctly
    - _Requirements: All_

  - [ ] 13.3 Performance testing
    - Run load tests with 1000+ concurrent users
    - Verify 95th percentile response time < 500ms
    - Verify cache hit rates meet targets (80% for distances, 60% for popular)
    - Monitor database query performance
    - Check for memory leaks or performance degradation
    - _Requirements: 8.1, 8.5, 8.6_

- [ ] 14. Checkpoint - Final verification
  - All tests pass (unit, integration, property-based, e2e)
  - Performance metrics meet targets (response time, cache hit rate)
  - Accessibility requirements met (WCAG 2.1 AA)
  - Analytics tracking works correctly
  - Error handling works gracefully
  - Mobile and desktop layouts work correctly
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Documentation and deployment preparation
  - [ ] 15.1 Write API documentation
    - Document `GET /sessions/:id/recommendations` endpoint
    - Document request parameters and response format
    - Document error responses and status codes
    - Add example requests and responses
    - Update Swagger/OpenAPI specification
    - _Requirements: 1.1, 1.10_

  - [ ] 15.2 Write developer documentation
    - Document scoring algorithm and weights
    - Document caching strategy and TTLs
    - Document fallback behavior and triggers
    - Document analytics events and data structure
    - Add code comments for complex logic
    - _Requirements: All_

  - [ ] 15.3 Prepare deployment configuration
    - Add feature flag configuration for gradual rollout
    - Configure Redis for caching (if not already set up)
    - Set up monitoring and alerting (error rate, response time, CTR)
    - Configure CORS for frontend domains
    - Set up rate limiting (100 requests/minute per IP)
    - _Requirements: 8.1, 8.5_

## Notes

- Tasks marked with `*` are optional testing tasks and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property-based tests must run minimum 100 iterations per property
- Checkpoints ensure incremental validation at key milestones
- Backend tasks (1-4) should be completed before frontend tasks (5-8)
- Performance optimizations (10) can be done in parallel with analytics (9)
- Final integration testing (13-14) ensures all components work together correctly
- The feature uses existing database schema (no migrations required)
- All code should follow NestJS and React best practices
- Use TypeScript strict mode for type safety
