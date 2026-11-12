package dev.study.payguard.pipeline;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import org.apache.flink.api.common.serialization.AbstractDeserializationSchema;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Читает JSON и пропускает битые записи. Возврат null заставляет источник Kafka просто пропустить запись. */
public class LenientJsonSchema<T> extends AbstractDeserializationSchema<T> {

    private static final Logger LOG = LoggerFactory.getLogger(LenientJsonSchema.class);

    private final Class<T> type;
    private transient ObjectMapper mapper;

    public LenientJsonSchema(Class<T> type) {
        super(type);
        this.type = type;
    }

    @Override
    public void open(InitializationContext context) {
        mapper = new ObjectMapper();
    }

    @Override
    public T deserialize(byte[] message) {
        try {
            return mapper.readValue(message, type);
        } catch (IOException e) {
            LOG.warn("Пропускаю запись, которую не удалось разобрать как {}", type.getSimpleName(), e);
            return null;
        }
    }
}
