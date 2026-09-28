package cardwar.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.fields;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.library.Architectures;

/**
 * Architecture rules enforced as tests. These are the load-bearing part of the modular-monolith design: without
 * them the boundaries are a convention that erodes on the first deadline.
 */
@AnalyzeClasses(
        packages = "cardwar",
        importOptions = {ImportOption.DoNotIncludeTests.class})
class ArchitectureTest {

    // --- layering and naming ------------------------------------------------------------------------------

    @ArchTest
    static final ArchRule layersAreRespected = Architectures.layeredArchitecture()
            .consideringOnlyDependenciesInLayers()
            .layer("Controller")
            .definedBy("..controller..")
            .layer("Service")
            .definedBy("..service..")
            .layer("Repository")
            .definedBy("..repository..")
            .whereLayer("Controller")
            .mayNotBeAccessedByAnyLayer()
            .whereLayer("Service")
            .mayOnlyBeAccessedByLayers("Controller")
            .whereLayer("Repository")
            .mayOnlyBeAccessedByLayers("Service");

    @ArchTest
    static final ArchRule noFieldInjection = fields().should()
            .notBeAnnotatedWith("org.springframework.beans.factory.annotation.Autowired")
            .as("prefer constructor injection over field injection");

    /*
     * Naming rules apply to top-level types only. A nested helper record is an implementation detail of the class
     * that declares it, and an anonymous class has no name to check in the first place.
     */

    @ArchTest
    static final ArchRule controllersAreNamedProperly = classes()
            .that()
            .resideInAPackage("..controller..")
            .and()
            .areTopLevelClasses()
            .should()
            .haveSimpleNameEndingWith("Controller");

    @ArchTest
    static final ArchRule servicesAreNamedProperly = classes()
            .that()
            .resideInAPackage("..service..")
            .and()
            .areTopLevelClasses()
            .should()
            .haveSimpleNameEndingWith("Service");

    @ArchTest
    static final ArchRule repositoriesAreNamedProperly = classes()
            .that()
            .resideInAPackage("..repository..")
            .and()
            .areTopLevelClasses()
            .should()
            .haveSimpleNameEndingWith("Repository");

    // --- the engine stays pure ----------------------------------------------------------------------------

    /**
     * The single most important rule here. The engine is meant to be driven unchanged by a REST controller today
     * and a Telegram adapter later; the moment it can see a framework or a sibling module, that stops being true.
     */
    @ArchTest
    static final ArchRule engineIsFrameworkAndModuleFree = noClasses()
            .that()
            .resideInAPackage("cardwar.engine..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                    "org.springframework..",
                    "jakarta..",
                    "com.fasterxml..",
                    "org.hibernate..",
                    "lombok..",
                    "cardwar.catalog..",
                    "cardwar.session..",
                    "cardwar.account..",
                    "cardwar.monetization..",
                    "cardwar.security..",
                    "cardwar.api..",
                    "cardwar.config..",
                    "cardwar.exception..")
            .as("the engine must depend on nothing but the JDK");

    /** Skins must not be able to influence the game, so the engine cannot even see the catalog. */
    @ArchTest
    static final ArchRule engineCannotSeeSkins = noClasses()
            .that()
            .resideInAPackage("cardwar.engine..")
            .should()
            .dependOnClassesThat()
            .resideInAPackage("cardwar.catalog..")
            .as("skins are cosmetic; the engine must never resolve one");

    /** A guessable shuffle is a guessable hand: security-relevant randomness comes from SecureRandom only. */
    @ArchTest
    static final ArchRule noInsecureRandomness = noClasses()
            .that()
            .resideInAnyPackage("cardwar.engine..", "cardwar.security..", "cardwar.session..")
            .should()
            .dependOnClassesThat()
            .haveFullyQualifiedName("java.util.Random")
            .as("use java.security.SecureRandom, never java.util.Random");

    // --- module boundaries --------------------------------------------------------------------------------

    @ArchTest
    static final ArchRule modulesAreFreeOfCycles =
            slices().matching("cardwar.(*)..").should().beFreeOfCycles();

    /**
     * Modules talk to each other through services. Reaching into another module's repository or domain is what
     * turns a modular monolith back into a big ball of mud, and it is what would make a later extraction painful.
     * One rule per module, so a failure names the module that was breached.
     */
    @ArchTest
    static final ArchRule catalogInternalsStayInternal = internalsStayInternal("catalog");

    @ArchTest
    static final ArchRule sessionInternalsStayInternal = internalsStayInternal("session");

    @ArchTest
    static final ArchRule accountInternalsStayInternal = internalsStayInternal("account");

    @ArchTest
    static final ArchRule monetizationInternalsStayInternal = internalsStayInternal("monetization");

    private static ArchRule internalsStayInternal(String module) {
        return noClasses()
                .that()
                .resideOutsideOfPackage("cardwar." + module + "..")
                .should()
                .dependOnClassesThat()
                .resideInAnyPackage("cardwar." + module + ".repository..", "cardwar." + module + ".domain..")
                .as("no module may reach into " + module + "'s repository or domain");
    }

    /**
     * Redis is an implementation detail of the state store and the event channel. Keeping it out of the services
     * is what makes {@code GameStateStore} a genuine seam rather than an aspiration.
     */
    @ArchTest
    static final ArchRule redisStaysBehindTheStore = noClasses()
            .that()
            .resideOutsideOfPackages("cardwar.session.store..", "cardwar.session.event..", "cardwar.config..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage("org.springframework.data.redis..", "io.lettuce..", "redis.clients..")
            .as("only the state store, the event channel and configuration may see Redis");
}
