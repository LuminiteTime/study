package dev.study.payguard.pipeline;

import dev.study.payguard.model.FraudAlert;
import dev.study.payguard.model.PaymentEvent;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.apache.flink.cep.CEP;
import org.apache.flink.cep.functions.PatternProcessFunction;
import org.apache.flink.cep.nfa.aftermatch.AfterMatchSkipStrategy;
import org.apache.flink.cep.pattern.Pattern;
import org.apache.flink.cep.pattern.conditions.IterativeCondition;
import org.apache.flink.cep.pattern.conditions.SimpleCondition;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.datastream.KeyedStream;
import org.apache.flink.util.Collector;

/** Последовательности платежей, по которым видно мошенничество. Ключ потока это cardId. */
public final class FraudPatterns {

    public static final String CARD_TESTING_RULE = "card-testing";
    public static final String IMPOSSIBLE_TRAVEL_RULE = "impossible-travel";

    static final long SMALL_AMOUNT_MINOR = 500;
    static final long LARGE_AMOUNT_MINOR = 30_000;
    private static final int MIN_PROBES = 3;
    private static final Duration CARD_TESTING_WINDOW = Duration.ofMinutes(5);
    private static final Duration TRAVEL_WINDOW = Duration.ofMinutes(10);

    /** Проверка карты: несколько мелких платежей подряд и затем крупный. */
    public static Pattern<PaymentEvent, ?> cardTesting() {
        return Pattern.<PaymentEvent>begin("probes", AfterMatchSkipStrategy.skipPastLastEvent())
                .where(SimpleCondition.of(payment -> payment.amountMinor() < SMALL_AMOUNT_MINOR))
                .timesOrMore(MIN_PROBES)
                .consecutive()
                .next("cash-out")
                .where(SimpleCondition.of(payment -> payment.amountMinor() > LARGE_AMOUNT_MINOR))
                .within(CARD_TESTING_WINDOW);
    }

    /** Два платежа подряд из разных стран за время, за которое туда не добраться. */
    public static Pattern<PaymentEvent, ?> impossibleTravel() {
        return Pattern.<PaymentEvent>begin("first", AfterMatchSkipStrategy.skipPastLastEvent())
                .next("second")
                .where(new DifferentCountry())
                .within(TRAVEL_WINDOW);
    }

    public static DataStream<FraudAlert> cardTestingAlerts(KeyedStream<PaymentEvent, String> byCard) {
        return CEP.pattern(byCard, cardTesting())
                .process(new AlertOnMatch(CARD_TESTING_RULE, "cash-out", "мелкие платежи и сразу крупный"))
                .name("cep-card-testing")
                .uid("cep-card-testing");
    }

    public static DataStream<FraudAlert> impossibleTravelAlerts(KeyedStream<PaymentEvent, String> byCard) {
        return CEP.pattern(byCard, impossibleTravel())
                .process(new AlertOnMatch(IMPOSSIBLE_TRAVEL_RULE, "second", "платежи из разных стран за 10 минут"))
                .name("cep-impossible-travel")
                .uid("cep-impossible-travel");
    }

    private static final class DifferentCountry extends IterativeCondition<PaymentEvent> {
        @Override
        public boolean filter(PaymentEvent payment, Context<PaymentEvent> context) throws Exception {
            for (PaymentEvent first : context.getEventsForPattern("first")) {
                if (!first.country().equals(payment.country())) {
                    return true;
                }
            }
            return false;
        }
    }

    private static final class AlertOnMatch extends PatternProcessFunction<PaymentEvent, FraudAlert> {

        private final String ruleId;
        private final String triggerStep;
        private final String detail;

        AlertOnMatch(String ruleId, String triggerStep, String detail) {
            this.ruleId = ruleId;
            this.triggerStep = triggerStep;
            this.detail = detail;
        }

        @Override
        public void processMatch(Map<String, List<PaymentEvent>> match, Context context, Collector<FraudAlert> out) {
            out.collect(FraudAlert.of(ruleId, match.get(triggerStep).get(0), detail));
        }
    }

    private FraudPatterns() {
    }
}
