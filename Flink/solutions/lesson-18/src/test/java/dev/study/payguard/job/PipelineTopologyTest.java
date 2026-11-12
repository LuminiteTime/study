package dev.study.payguard.job;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.graph.StreamGraph;
import org.apache.flink.streaming.api.graph.StreamNode;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/** Проверяет граф задания, не запуская его: ошибки сериализации и пропущенные uid видны за секунды. */
class PipelineTopologyTest {

    private static StreamGraph graph;

    @BeforeAll
    static void buildGraph() {
        System.setProperty("PAYGUARD_DB_URL", "jdbc:postgresql://unused:5432/unused");
        System.setProperty("PAYGUARD_DB_USER", "unused");
        System.setProperty("PAYGUARD_DB_PASSWORD", "unused");

        StreamExecutionEnvironment env = PayGuardJob.createEnvironment();
        PayGuardJob.buildPipeline(env, JobConfig.fromArgs(new String[0]));
        graph = env.getStreamGraph();
    }

    @Test
    void everyOperatorHasStableUid() {
        List<String> withoutUid = graph.getStreamNodes().stream()
                .filter(node -> node.getTransformationUID() == null)
                .map(StreamNode::getOperatorName)
                .toList();

        assertThat(withoutUid).isEmpty();
    }

    @Test
    void uidsAreUnique() {
        List<String> uids = graph.getStreamNodes().stream().map(StreamNode::getTransformationUID).toList();

        assertThat(uids).doesNotHaveDuplicates();
    }

    @Test
    void graphTranslatesToJobGraph() {
        assertThat(graph.getJobGraph().getNumberOfVertices()).isGreaterThan(1);
    }
}
