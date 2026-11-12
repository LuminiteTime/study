package dev.study.payguard.pipeline;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.study.payguard.model.ParsedRecord;
import dev.study.payguard.model.PaymentEvent;
import dev.study.payguard.model.RejectedRecord;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import org.apache.flink.api.common.serialization.AbstractDeserializationSchema;

/**
 * Разбирает запись прямо в источнике Kafka. Метка времени становится известна до выхода из источника,
 * поэтому watermark считается отдельно для каждой партиции.
 */
public class ParsedRecordSchema extends AbstractDeserializationSchema<ParsedRecord> {

    private transient ObjectMapper mapper;

    @Override
    public void open(InitializationContext context) {
        mapper = new ObjectMapper();
    }

    @Override
    public ParsedRecord deserialize(byte[] message) {
        String raw = new String(message, StandardCharsets.UTF_8);
        try {
            PaymentEvent payment = mapper.readValue(raw, PaymentEvent.class);
            Optional<String> reason = PaymentValidator.rejectionReason(payment);
            return reason.map(r -> rejected(raw, r)).orElseGet(() -> ParsedRecord.accepted(payment));
        } catch (JsonProcessingException e) {
            return rejected(raw, "bad-json");
        }
    }

    private static ParsedRecord rejected(String raw, String reason) {
        return ParsedRecord.rejected(new RejectedRecord(raw, reason, System.currentTimeMillis()));
    }
}
