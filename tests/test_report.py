"""Tests for remote_observability.report module."""

from __future__ import annotations

from remote_observability.models import ComponentResult, ComponentStatus, ProvisioningReport
from remote_observability.report import build_report, format_report


class TestBuildReport:
    """Tests for build_report() — Requirement 9.1."""

    def test_all_installed_returns_success_true(self) -> None:
        components = [
            ComponentResult(name="Docker Engine", status=ComponentStatus.INSTALLED, version="24.0.7"),
            ComponentResult(name="OpenSearch", status=ComponentStatus.INSTALLED, version="2.11.0"),
        ]
        report = build_report(components)
        assert report.success is True
        assert report.components == components

    def test_one_failed_returns_success_false(self) -> None:
        components = [
            ComponentResult(name="Docker Engine", status=ComponentStatus.INSTALLED, version="24.0.7"),
            ComponentResult(name="Docker Compose", status=ComponentStatus.FAILED, error="apt failed"),
        ]
        report = build_report(components)
        assert report.success is False

    def test_empty_components_returns_success_true(self) -> None:
        report = build_report([])
        assert report.success is True
        assert report.components == []

    def test_skipped_does_not_cause_failure(self) -> None:
        components = [
            ComponentResult(name="Docker Engine", status=ComponentStatus.SKIPPED),
        ]
        report = build_report(components)
        assert report.success is True


class TestFormatReportJson:
    """Tests for format_report() JSON output — Requirement 9.4."""

    def test_json_round_trip(self) -> None:
        components = [
            ComponentResult(
                name="Jaeger",
                status=ComponentStatus.INSTALLED,
                version="1.52",
                url_or_port="http://localhost:16686",
            ),
        ]
        report = build_report(components)
        json_str = format_report(report, fmt="json")
        restored = ProvisioningReport.from_json(json_str)
        assert restored.success == report.success
        assert len(restored.components) == 1
        assert restored.components[0].name == "Jaeger"

    def test_json_uses_to_json(self) -> None:
        report = ProvisioningReport(components=[], success=True)
        assert format_report(report, "json") == report.to_json()


class TestFormatReportText:
    """Tests for format_report() text output — Requirements 9.2, 9.3, 9.5."""

    def test_text_contains_component_name(self) -> None:
        components = [
            ComponentResult(name="Docker Engine", status=ComponentStatus.INSTALLED, version="24.0.7"),
        ]
        report = build_report(components)
        text = format_report(report, fmt="text")
        assert "Docker Engine" in text

    def test_text_contains_status(self) -> None:
        components = [
            ComponentResult(name="Docker Engine", status=ComponentStatus.INSTALLED, version="24.0.7"),
        ]
        report = build_report(components)
        text = format_report(report, fmt="text")
        assert "installed" in text

    def test_text_contains_version(self) -> None:
        components = [
            ComponentResult(name="Jaeger", status=ComponentStatus.INSTALLED, version="1.52"),
        ]
        report = build_report(components)
        text = format_report(report, fmt="text")
        assert "1.52" in text

    def test_text_contains_url_or_port(self) -> None:
        components = [
            ComponentResult(
                name="Jaeger",
                status=ComponentStatus.INSTALLED,
                version="1.52",
                url_or_port="http://localhost:16686",
            ),
        ]
        report = build_report(components)
        text = format_report(report, fmt="text")
        assert "http://localhost:16686" in text

    def test_text_shows_na_for_missing_version(self) -> None:
        components = [
            ComponentResult(name="OTel Collector", status=ComponentStatus.FAILED),
        ]
        report = build_report(components)
        text = format_report(report, fmt="text")
        assert "N/A" in text

    def test_text_shows_overall_success(self) -> None:
        components = [
            ComponentResult(name="Docker Engine", status=ComponentStatus.INSTALLED, version="24.0.7"),
        ]
        report = build_report(components)
        text = format_report(report, fmt="text")
        assert "SUCCESS" in text

    def test_text_shows_overall_failed(self) -> None:
        components = [
            ComponentResult(name="Docker Engine", status=ComponentStatus.FAILED, error="oops"),
        ]
        report = build_report(components)
        text = format_report(report, fmt="text")
        assert "FAILED" in text


class TestFormatReportInvalidFormat:
    """Test that invalid format raises ValueError."""

    def test_invalid_format_raises(self) -> None:
        report = ProvisioningReport()
        try:
            format_report(report, fmt="xml")
            assert False, "Expected ValueError"
        except ValueError:
            pass
