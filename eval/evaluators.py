"""
Evaluators for Stage 1 (Claim Detection) and Stage 2 (Verification).

Calculates metrics including accuracy, precision, recall, F1, confidence calibration,
source quality, and performance metrics.
"""

from typing import List, Dict, Any, Tuple
import numpy as np
from collections import defaultdict, Counter

from dataset_schema import (
    Stage1Sample, Stage2Sample, ModelPrediction, Verdict, Source
)


class Stage1Evaluator:
    """Evaluator for Stage 1: Claim Detection"""
    
    def evaluate(
        self,
        predictions: List[ModelPrediction],
        ground_truth: List[Stage1Sample]
    ) -> Dict[str, Any]:
        """
        Evaluate Stage 1 predictions
        
        Args:
            predictions: List of model predictions
            ground_truth: List of ground truth samples
        
        Returns:
            Dictionary with evaluation metrics
        """
        # Match predictions to ground truth
        pred_dict = {p.sample_id: p for p in predictions}
        gt_dict = {s.id: s for s in ground_truth}
        
        # Ensure alignment
        matched_pairs = []
        for sample_id in gt_dict.keys():
            if sample_id in pred_dict:
                matched_pairs.append((pred_dict[sample_id], gt_dict[sample_id]))
        
        if not matched_pairs:
            return {"error": "No matching predictions found"}
        
        # Extract predictions and labels
        y_pred = [p.prediction for p, _ in matched_pairs]
        y_true = [gt.has_claim for _, gt in matched_pairs]
        
        # Calculate classification metrics
        metrics = self._calculate_classification_metrics(y_pred, y_true)
        
        # Calculate performance metrics
        perf_metrics = self._calculate_performance_metrics(predictions)
        metrics.update(perf_metrics)
        
        # Confusion matrix analysis
        confusion = self._analyze_confusion_matrix(
            y_pred, y_true, [gt for _, gt in matched_pairs]
        )
        metrics["confusion_analysis"] = confusion
        
        # Error analysis by category
        error_analysis = self._error_analysis_by_category(
            matched_pairs, y_pred, y_true
        )
        metrics["error_analysis"] = error_analysis
        
        return metrics
    
    def _calculate_classification_metrics(
        self,
        y_pred: List[bool],
        y_true: List[bool]
    ) -> Dict[str, float]:
        """Calculate precision, recall, F1, accuracy"""
        
        # True Positives, False Positives, True Negatives, False Negatives
        tp = sum(1 for pred, true in zip(y_pred, y_true) if pred and true)
        fp = sum(1 for pred, true in zip(y_pred, y_true) if pred and not true)
        tn = sum(1 for pred, true in zip(y_pred, y_true) if not pred and not true)
        fn = sum(1 for pred, true in zip(y_pred, y_true) if not pred and true)
        
        # Calculate metrics
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
        accuracy = (tp + tn) / len(y_pred) if len(y_pred) > 0 else 0.0
        
        # False positive and false negative rates
        fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
        fnr = fn / (fn + tp) if (fn + tp) > 0 else 0.0
        
        return {
            "accuracy": accuracy,
            "precision": precision,
            "recall": recall,
            "f1_score": f1,
            "false_positive_rate": fpr,
            "false_negative_rate": fnr,
            "true_positives": tp,
            "false_positives": fp,
            "true_negatives": tn,
            "false_negatives": fn,
            "total_samples": len(y_pred),
        }
    
    def _calculate_performance_metrics(
        self,
        predictions: List[ModelPrediction]
    ) -> Dict[str, float]:
        """Calculate latency and cost metrics"""
        
        latencies = [p.latency for p in predictions if p.latency > 0]
        costs = [p.cost for p in predictions if p.cost > 0]
        
        if not latencies:
            latencies = [0]
        if not costs:
            costs = [0]
        
        return {
            "mean_latency": np.mean(latencies),
            "median_latency": np.median(latencies),
            "p90_latency": np.percentile(latencies, 90),
            "p95_latency": np.percentile(latencies, 95),
            "p99_latency": np.percentile(latencies, 99),
            "max_latency": np.max(latencies),
            "total_cost": sum(costs),
            "mean_cost_per_sample": np.mean(costs),
        }
    
    def _analyze_confusion_matrix(
        self,
        y_pred: List[bool],
        y_true: List[bool],
        samples: List[Stage1Sample]
    ) -> Dict[str, Any]:
        """Analyze confusion matrix with examples"""
        
        # Collect false positives and false negatives
        false_positives = []
        false_negatives = []
        
        for pred, true, sample in zip(y_pred, y_true, samples):
            if pred and not true:
                false_positives.append({
                    "id": sample.id,
                    "text": sample.text[:100] + "..." if len(sample.text) > 100 else sample.text,
                    "platform": sample.platform.value,
                    "metadata": sample.metadata
                })
            elif not pred and true:
                false_negatives.append({
                    "id": sample.id,
                    "text": sample.text[:100] + "..." if len(sample.text) > 100 else sample.text,
                    "platform": sample.platform.value,
                    "claims": sample.claims,
                    "metadata": sample.metadata
                })
        
        return {
            "false_positives": false_positives[:10],  # Limit to first 10
            "false_negatives": false_negatives[:10],
            "num_false_positives": len(false_positives),
            "num_false_negatives": len(false_negatives),
        }
    
    def _error_analysis_by_category(
        self,
        matched_pairs: List[Tuple[ModelPrediction, Stage1Sample]],
        y_pred: List[bool],
        y_true: List[bool]
    ) -> Dict[str, Any]:
        """Analyze errors by platform, topic, complexity"""
        
        # Group by categories
        by_platform = defaultdict(lambda: {"correct": 0, "total": 0})
        by_topic = defaultdict(lambda: {"correct": 0, "total": 0})
        by_complexity = defaultdict(lambda: {"correct": 0, "total": 0})
        
        for (pred, sample), pred_val, true_val in zip(matched_pairs, y_pred, y_true):
            correct = pred_val == true_val
            
            # By platform
            platform = sample.platform.value
            by_platform[platform]["total"] += 1
            if correct:
                by_platform[platform]["correct"] += 1
            
            # By topic
            topic = sample.metadata.get("topic", "other")
            by_topic[topic]["total"] += 1
            if correct:
                by_topic[topic]["correct"] += 1
            
            # By complexity
            complexity = sample.metadata.get("complexity", "moderate")
            by_complexity[complexity]["total"] += 1
            if correct:
                by_complexity[complexity]["correct"] += 1
        
        # Calculate accuracy per category
        def calc_accuracy(stats_dict):
            return {
                cat: {
                    "accuracy": stats["correct"] / stats["total"] if stats["total"] > 0 else 0,
                    "correct": stats["correct"],
                    "total": stats["total"]
                }
                for cat, stats in stats_dict.items()
            }
        
        return {
            "by_platform": calc_accuracy(by_platform),
            "by_topic": calc_accuracy(by_topic),
            "by_complexity": calc_accuracy(by_complexity),
        }


class Stage2Evaluator:
    """Evaluator for Stage 2: Verification"""
    
    def evaluate(
        self,
        predictions: List[ModelPrediction],
        ground_truth: List[Stage2Sample]
    ) -> Dict[str, Any]:
        """
        Evaluate Stage 2 predictions
        
        Args:
            predictions: List of model predictions
            ground_truth: List of ground truth samples
        
        Returns:
            Dictionary with evaluation metrics
        """
        # Match predictions to ground truth
        pred_dict = {p.sample_id: p for p in predictions}
        gt_dict = {s.id: s for s in ground_truth}
        
        matched_pairs = []
        for sample_id in gt_dict.keys():
            if sample_id in pred_dict:
                matched_pairs.append((pred_dict[sample_id], gt_dict[sample_id]))
        
        if not matched_pairs:
            return {"error": "No matching predictions found"}
        
        # Extract predictions and labels
        y_pred = [self._verdict_to_str(p.prediction) for p, _ in matched_pairs]
        y_true = [gt.verdict.value for _, gt in matched_pairs]
        
        # Calculate accuracy metrics
        metrics = self._calculate_accuracy_metrics(y_pred, y_true)
        
        # Calculate critical errors (TRUE↔FALSE swaps)
        critical = self._calculate_critical_errors(y_pred, y_true)
        metrics["critical_errors"] = critical
        
        # Calculate confidence calibration
        confidences = [p.confidence for p, _ in matched_pairs]
        calibration = self._calculate_calibration(y_pred, y_true, confidences)
        metrics["calibration"] = calibration
        
        # Calculate source quality metrics
        source_quality = self._calculate_source_quality(matched_pairs)
        metrics["source_quality"] = source_quality
        
        # Calculate performance metrics
        perf_metrics = self._calculate_performance_metrics(predictions)
        metrics.update(perf_metrics)
        
        # Error analysis
        error_analysis = self._error_analysis_by_category(matched_pairs, y_pred, y_true)
        metrics["error_analysis"] = error_analysis
        
        return metrics
    
    def _verdict_to_str(self, prediction: Any) -> str:
        """Convert prediction to string verdict"""
        if isinstance(prediction, Verdict):
            return prediction.value
        elif isinstance(prediction, str):
            return prediction.lower()
        else:
            return "unknown"
    
    def _calculate_accuracy_metrics(
        self,
        y_pred: List[str],
        y_true: List[str]
    ) -> Dict[str, Any]:
        """Calculate multi-class accuracy metrics"""
        
        # Overall accuracy
        accuracy = sum(1 for p, t in zip(y_pred, y_true) if p == t) / len(y_pred)
        
        # Per-class metrics
        labels = ["true", "false", "unknown"]
        per_class = {}
        
        for label in labels:
            # True positives, false positives, false negatives
            tp = sum(1 for p, t in zip(y_pred, y_true) if p == label and t == label)
            fp = sum(1 for p, t in zip(y_pred, y_true) if p == label and t != label)
            fn = sum(1 for p, t in zip(y_pred, y_true) if p != label and t == label)
            
            precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
            recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
            f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
            
            per_class[label] = {
                "precision": precision,
                "recall": recall,
                "f1_score": f1,
                "support": sum(1 for t in y_true if t == label)
            }
        
        # Confusion matrix
        confusion_matrix = self._build_confusion_matrix(y_pred, y_true, labels)
        
        return {
            "accuracy": accuracy,
            "per_class": per_class,
            "confusion_matrix": confusion_matrix,
            "total_samples": len(y_pred),
        }
    
    def _build_confusion_matrix(
        self,
        y_pred: List[str],
        y_true: List[str],
        labels: List[str]
    ) -> Dict[str, Dict[str, int]]:
        """Build confusion matrix"""
        matrix = {true_label: {pred_label: 0 for pred_label in labels} for true_label in labels}
        
        for pred, true in zip(y_pred, y_true):
            if true in matrix and pred in matrix[true]:
                matrix[true][pred] += 1
        
        return matrix
    
    def _calculate_critical_errors(
        self,
        y_pred: List[str],
        y_true: List[str]
    ) -> Dict[str, Any]:
        """Calculate critical errors (TRUE↔FALSE swaps)"""
        
        true_to_false = sum(1 for p, t in zip(y_pred, y_true) if p == "false" and t == "true")
        false_to_true = sum(1 for p, t in zip(y_pred, y_true) if p == "true" and t == "false")
        
        total_critical = true_to_false + false_to_true
        total = len(y_pred)
        critical_rate = total_critical / total if total > 0 else 0
        
        return {
            "true_marked_false": true_to_false,
            "false_marked_true": false_to_true,
            "total_critical_errors": total_critical,
            "critical_error_rate": critical_rate,
        }
    
    def _calculate_calibration(
        self,
        y_pred: List[str],
        y_true: List[str],
        confidences: List[float]
    ) -> Dict[str, Any]:
        """Calculate confidence calibration metrics"""
        
        # Bin predictions by confidence level
        bins = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
        calibration_data = {}
        
        for i, (low, high) in enumerate(zip(bins[:-1], bins[1:])):
            mask = [(c >= low and c < high) for c in confidences]
            
            if sum(mask) > 0:
                preds_in_bin = [p for p, m in zip(y_pred, mask) if m]
                trues_in_bin = [t for t, m in zip(y_true, mask) if m]
                confs_in_bin = [c for c, m in zip(confidences, mask) if m]
                
                actual_accuracy = sum(1 for p, t in zip(preds_in_bin, trues_in_bin) if p == t) / len(preds_in_bin)
                expected_confidence = np.mean(confs_in_bin)
                
                calibration_data[f"{low:.1f}-{high:.1f}"] = {
                    "expected": expected_confidence,
                    "actual": actual_accuracy,
                    "samples": len(preds_in_bin),
                    "calibration_error": abs(expected_confidence - actual_accuracy)
                }
        
        # Expected Calibration Error (ECE)
        ece = sum(
            d["calibration_error"] * d["samples"] 
            for d in calibration_data.values()
        ) / len(confidences) if len(confidences) > 0 else 0
        
        return {
            "expected_calibration_error": ece,
            "calibration_by_bin": calibration_data,
        }
    
    def _calculate_source_quality(
        self,
        matched_pairs: List[Tuple[ModelPrediction, Stage2Sample]]
    ) -> Dict[str, Any]:
        """Evaluate quality of sources cited"""
        
        if not matched_pairs:
            return {}
        
        source_overlaps = []
        avg_reliabilities = []
        source_counts = []
        unique_domains = []
        
        for pred, gt in matched_pairs:
            # Extract source URLs
            pred_urls = {s.get("url", "") for s in pred.sources if isinstance(s, dict)}
            gt_urls = {s.url for s in gt.sources}
            
            # Source overlap
            if gt_urls:
                overlap = len(pred_urls & gt_urls) / len(gt_urls)
                source_overlaps.append(overlap)
            
            # Average reliability
            if pred.sources:
                reliabilities = [s.get("reliability_score", 0.5) for s in pred.sources if isinstance(s, dict)]
                if reliabilities:
                    avg_reliabilities.append(np.mean(reliabilities))
                
                # Source count
                source_counts.append(len(pred.sources))
                
                # Unique domains
                domains = {self._extract_domain(s.get("url", "")) for s in pred.sources if isinstance(s, dict)}
                unique_domains.append(len(domains))
        
        return {
            "avg_source_overlap": np.mean(source_overlaps) if source_overlaps else 0,
            "avg_source_reliability": np.mean(avg_reliabilities) if avg_reliabilities else 0,
            "avg_sources_per_prediction": np.mean(source_counts) if source_counts else 0,
            "avg_unique_domains": np.mean(unique_domains) if unique_domains else 0,
        }
    
    def _extract_domain(self, url: str) -> str:
        """Extract domain from URL"""
        from urllib.parse import urlparse
        try:
            return urlparse(url).netloc
        except:
            return ""
    
    def _calculate_performance_metrics(
        self,
        predictions: List[ModelPrediction]
    ) -> Dict[str, float]:
        """Calculate latency and cost metrics"""
        
        latencies = [p.latency for p in predictions if p.latency > 0]
        costs = [p.cost for p in predictions if p.cost > 0]
        
        if not latencies:
            latencies = [0]
        if not costs:
            costs = [0]
        
        return {
            "mean_latency": np.mean(latencies),
            "median_latency": np.median(latencies),
            "p90_latency": np.percentile(latencies, 90),
            "p95_latency": np.percentile(latencies, 95),
            "p99_latency": np.percentile(latencies, 99),
            "max_latency": np.max(latencies),
            "total_cost": sum(costs),
            "mean_cost_per_sample": np.mean(costs),
        }
    
    def _error_analysis_by_category(
        self,
        matched_pairs: List[Tuple[ModelPrediction, Stage2Sample]],
        y_pred: List[str],
        y_true: List[str]
    ) -> Dict[str, Any]:
        """Analyze errors by difficulty, topic"""
        
        by_difficulty = defaultdict(lambda: {"correct": 0, "total": 0})
        by_topic = defaultdict(lambda: {"correct": 0, "total": 0})
        
        for (pred, sample), pred_val, true_val in zip(matched_pairs, y_pred, y_true):
            correct = pred_val == true_val
            
            # By difficulty
            difficulty = sample.difficulty.value
            by_difficulty[difficulty]["total"] += 1
            if correct:
                by_difficulty[difficulty]["correct"] += 1
            
            # By topic
            topic = sample.topic.value
            by_topic[topic]["total"] += 1
            if correct:
                by_topic[topic]["correct"] += 1
        
        def calc_accuracy(stats_dict):
            return {
                cat: {
                    "accuracy": stats["correct"] / stats["total"] if stats["total"] > 0 else 0,
                    "correct": stats["correct"],
                    "total": stats["total"]
                }
                for cat, stats in stats_dict.items()
            }
        
        return {
            "by_difficulty": calc_accuracy(by_difficulty),
            "by_topic": calc_accuracy(by_topic),
        }


def print_evaluation_report(stage: int, metrics: Dict[str, Any], model_name: str = "Model"):
    """Print formatted evaluation report"""
    
    print(f"\n{'='*60}")
    print(f"Stage {stage} Evaluation Report: {model_name}")
    print(f"{'='*60}\n")
    
    if stage == 1:
        print(f"Classification Metrics:")
        print(f"  Accuracy:  {metrics['accuracy']:.3f}")
        print(f"  Precision: {metrics['precision']:.3f}")
        print(f"  Recall:    {metrics['recall']:.3f}")
        print(f"  F1 Score:  {metrics['f1_score']:.3f}")
        print(f"  FPR:       {metrics['false_positive_rate']:.3f}")
        print(f"  FNR:       {metrics['false_negative_rate']:.3f}")
    else:
        print(f"Accuracy Metrics:")
        print(f"  Overall Accuracy: {metrics['accuracy']:.3f}")
        print(f"\n  Per-Class Metrics:")
        for label, scores in metrics['per_class'].items():
            print(f"    {label.upper()}: P={scores['precision']:.3f}, R={scores['recall']:.3f}, F1={scores['f1_score']:.3f}")
        
        print(f"\n  Critical Errors:")
        print(f"    TRUE→FALSE: {metrics['critical_errors']['true_marked_false']}")
        print(f"    FALSE→TRUE: {metrics['critical_errors']['false_marked_true']}")
        print(f"    Critical Error Rate: {metrics['critical_errors']['critical_error_rate']:.3f}")
        
        print(f"\n  Confidence Calibration:")
        print(f"    ECE: {metrics['calibration']['expected_calibration_error']:.3f}")
    
    print(f"\nPerformance Metrics:")
    print(f"  Mean Latency: {metrics['mean_latency']:.3f}s")
    print(f"  P90 Latency:  {metrics['p90_latency']:.3f}s")
    print(f"  Total Cost:   ${metrics['total_cost']:.4f}")
    print(f"  Cost/Sample:  ${metrics['mean_cost_per_sample']:.6f}")
    
    print(f"\n{'='*60}\n")
