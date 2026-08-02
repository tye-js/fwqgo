export const NETWORK_EXPERIENCE_REASON_CODES = {
  conditions: [
    "carrier_specific_access",
    "multi_carrier_split",
    "destination_asia",
    "destination_us_west",
    "realtime_sensitivity",
    "download_throughput_priority",
    "background_workload_tolerates_variance",
  ],
  advantages: [
    "carrier_optimized_route_family",
    "stable_path_is_preferred",
    "nearby_destination_may_reduce_path_complexity",
    "multi_line_choice_reduces_single_carrier_dependency",
    "cdn_can_absorb_static_traffic",
  ],
  risks: [
    "provider_label_may_not_match_delivered_route",
    "return_path_may_differ",
    "province_and_access_type_can_change_result",
    "peak_hour_congestion_requires_testing",
    "optimized_route_is_not_bandwidth_guarantee",
    "cross_carrier_behavior_is_not_guaranteed",
    "physical_distance_still_limits_realtime_use",
    "no_published_rule_for_scope",
    "conflicting_rules_at_same_specificity",
  ],
  verification: [
    "request_test_ip_and_looking_glass",
    "confirm_test_ip_matches_delivery_prefix",
    "run_ping_mtr_and_traceroute",
    "test_tcp_tls_and_real_request",
    "repeat_during_peak_hours",
    "test_with_each_relevant_carrier",
    "check_bandwidth_quota_and_shaping",
    "keep_24_to_72_hour_observation",
  ],
} as const;

export type NetworkExperienceReasonCode =
  (typeof NETWORK_EXPERIENCE_REASON_CODES)[keyof typeof NETWORK_EXPERIENCE_REASON_CODES][number];
